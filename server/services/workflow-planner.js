'use strict';
const { callLLM } = require('./llm');
const { createAndScheduleWorkflow } = require('./workflows');

const PLANNER_SYSTEM_PROMPT = `You are a workflow planner for Wingman. Given a user's natural language request, create one or more workflow definitions.

Return a JSON array of workflow objects. Each object must have:
- name: short name for the workflow
- description: what it does
- trigger_type: "schedule" | "manual" | "event"
- cron_expression: cron string if scheduled (null otherwise)
- steps: array of { instruction: string } describing what the agent should do
- variables: object of key-value pairs the agent needs
- system_prompt: instructions for the agent executing this workflow

If the request implies multiple independent automations, return multiple workflows.
If the request is ambiguous about timing, default to manual trigger.
For recurring tasks, parse the schedule into a cron expression.

RESPOND WITH ONLY THE JSON ARRAY — no markdown, no explanation.`;

async function planWorkflows(userMessage) {
  const messages = [{ role: 'user', content: userMessage }];
  const response = await callLLM(PLANNER_SYSTEM_PROMPT, messages, [], {});

  let plans;
  try {
    // Extract JSON from response, handling possible markdown wrapping
    let text = response.text.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    plans = JSON.parse(text);
    if (!Array.isArray(plans)) plans = [plans];
  } catch (err) {
    console.error('[planner] Failed to parse LLM response:', response.text);
    throw new Error('Failed to plan workflow — could not parse response');
  }

  return plans;
}

async function planAndCreateWorkflows(user, description) {
  const plans = await planWorkflows(description);
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

    created.push({ ...workflow, steps: plan.steps, variables: plan.variables, system_prompt: plan.system_prompt });
  }

  return created;
}

module.exports = { planWorkflows, planAndCreateWorkflows };
