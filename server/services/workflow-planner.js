'use strict';
const logger = require('./logger');
const { callLLM } = require('./llm');
const { createAndScheduleWorkflow } = require('./workflows');
const { getCachedWorkflowPlan, setCachedWorkflowPlan } = require('./llm-cache');
const { isValidCron } = require('../lib/validate-cron');

const ALLOWED_TRIGGER_TYPES = new Set(['schedule', 'manual', 'event']);
const MAX_PLANS = 10;
const MAX_STEPS = 50;
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_INSTRUCTION_LENGTH = 2000;
const MAX_VARIABLE_KEY_LENGTH = 100;
const MAX_VARIABLE_VALUE_LENGTH = 5000;
const MAX_VARIABLES = 50;

const PLANNER_SYSTEM_PROMPT = `You are a workflow planner for Wingman. Given a user's natural language request, create one or more workflow definitions.

Return a JSON array of workflow objects. Each object must have:
- name: short name for the workflow
- description: what it does
- trigger_type: "schedule" | "manual" | "event"
- cron_expression: cron string if scheduled (null otherwise)
- steps: array of { instruction: string } describing what the agent should do
- variables: object of key-value pairs the agent needs

If the request implies multiple independent automations, return multiple workflows.
If the request is ambiguous about timing, default to manual trigger.
For recurring tasks, parse the schedule into a cron expression.

RESPOND WITH ONLY THE JSON ARRAY — no markdown, no explanation.`;

/**
 * Validate and sanitize a single workflow plan from LLM output.
 * Strips unrecognized fields, enforces types and limits.
 */
function validatePlan(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Each workflow plan must be a JSON object');
  }

  const name = typeof raw.name === 'string' ? raw.name.slice(0, MAX_NAME_LENGTH) : null;
  if (!name) throw new Error('Workflow plan missing required "name" string');

  const description = typeof raw.description === 'string'
    ? raw.description.slice(0, MAX_DESCRIPTION_LENGTH)
    : '';

  const triggerType = ALLOWED_TRIGGER_TYPES.has(raw.trigger_type)
    ? raw.trigger_type
    : 'manual';

  const rawCron = (triggerType === 'schedule' && typeof raw.cron_expression === 'string')
    ? raw.cron_expression
    : null;
  const cronExpression = (rawCron && isValidCron(rawCron)) ? rawCron : null;

  // Validate steps: must be array of { instruction: string }
  let steps = [];
  if (Array.isArray(raw.steps)) {
    for (const step of raw.steps.slice(0, MAX_STEPS)) {
      if (typeof step === 'object' && step !== null && typeof step.instruction === 'string') {
        steps.push({ instruction: step.instruction.slice(0, MAX_INSTRUCTION_LENGTH) });
      }
      // silently drop malformed steps
    }
  }

  // Validate variables: must be flat object with string values
  let variables = {};
  if (typeof raw.variables === 'object' && raw.variables !== null && !Array.isArray(raw.variables)) {
    let count = 0;
    for (const [key, value] of Object.entries(raw.variables)) {
      if (count >= MAX_VARIABLES) break;
      const safeKey = String(key).slice(0, MAX_VARIABLE_KEY_LENGTH);
      // Coerce values to strings to prevent nested object injection
      variables[safeKey] = String(value).slice(0, MAX_VARIABLE_VALUE_LENGTH);
      count++;
    }
  }

  if (steps.length === 0) {
    throw new Error('Workflow plan has no valid steps');
  }

  // system_prompt is NOT accepted from LLM output — it must come from
  // trusted templates only, never from dynamically generated plans
  return { name, description, trigger_type: triggerType, cron_expression: cronExpression, steps, variables };
}

async function planWorkflows(userMessage, userId) {
  // Check cache first
  const cached = await getCachedWorkflowPlan(userMessage, userId);
  if (cached) return cached;

  const messages = [{ role: 'user', content: userMessage }];
  const response = await callLLM(PLANNER_SYSTEM_PROMPT, messages, [], {});

  let rawPlans;
  try {
    // Extract JSON from response, handling possible markdown wrapping
    let text = response.text.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    rawPlans = JSON.parse(text);
    if (!Array.isArray(rawPlans)) rawPlans = [rawPlans];
  } catch (err) {
    logger.error('[planner] Failed to parse LLM response');
    throw new Error('Failed to plan workflow — could not parse response');
  }

  if (rawPlans.length > MAX_PLANS) {
    rawPlans = rawPlans.slice(0, MAX_PLANS);
  }

  const plans = rawPlans.map(validatePlan);

  // Cache the validated plan
  await setCachedWorkflowPlan(userMessage, plans, userId);

  return plans;
}

async function planAndCreateWorkflows(user, description) {
  const plans = await planWorkflows(description, String(user.id));
  const created = [];

  for (const plan of plans) {
    const workflow = await createAndScheduleWorkflow(user.id, {
      name: plan.name,
      description: plan.description,
      trigger_type: plan.trigger_type || 'manual',
      cron_expression: plan.cron_expression || null,
      trigger_config: null,
      actions: [], // v2 agent workflows don't use flat actions
    });

    // Update with v2 fields
    const db = require('../db');
    await db.query(
      'UPDATE workflows SET steps = $1, variables = $2 WHERE id = $3',
      [JSON.stringify(plan.steps || []), JSON.stringify(plan.variables || {}), workflow.id]
    );

    created.push({ ...workflow, steps: plan.steps, variables: plan.variables });
  }

  return created;
}

module.exports = { planWorkflows, planAndCreateWorkflows };
