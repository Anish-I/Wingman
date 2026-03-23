'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { updatePushToken } = require('../db/queries');
const { processMessage } = require('../services/orchestrator');
const { getConnectionStatus, WINGMAN_APPS } = require('../services/composio');
const { createAndScheduleWorkflow, listWorkflows, stopWorkflow } = require('../services/workflows');
const { updateUserPreferences } = require('../db/queries');
const { isValidCron } = require('../lib/validate-cron');

// Parse pagination query params with sane defaults and bounds
function parsePagination(query) {
  let limit = parseInt(query.limit, 10);
  let offset = parseInt(query.offset, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

// Per-user rate limiter for /api/chat (30 req / 15 min)
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' } },
});

// Per-user rate limiter for workflow plan/run (20 req / 15 min)
const workflowLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' } },
});

// Max chat message length (chars) — prevents LLM cost abuse
const MAX_CHAT_MESSAGE_LENGTH = 4000;

// --- Workflow action input sanitization ---
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_INPUT_DEPTH = 5;
const MAX_INPUT_KEYS = 50;
const MAX_STRING_LENGTH = 10000;

/**
 * Validate a workflow action input object.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
function validateActionInput(obj, depth = 0) {
  if (depth > MAX_INPUT_DEPTH) return { valid: false, reason: 'input exceeds maximum nesting depth' };
  if (obj === null || obj === undefined) return { valid: true };

  const type = typeof obj;
  if (type === 'boolean' || type === 'number') {
    if (!Number.isFinite(obj) && type === 'number') return { valid: false, reason: 'non-finite numbers are not allowed' };
    return { valid: true };
  }
  if (type === 'string') {
    if (obj.length > MAX_STRING_LENGTH) return { valid: false, reason: `string value exceeds maximum length (${MAX_STRING_LENGTH})` };
    return { valid: true };
  }
  if (Array.isArray(obj)) {
    if (obj.length > MAX_INPUT_KEYS) return { valid: false, reason: `array exceeds maximum length (${MAX_INPUT_KEYS})` };
    for (let i = 0; i < obj.length; i++) {
      const r = validateActionInput(obj[i], depth + 1);
      if (!r.valid) return r;
    }
    return { valid: true };
  }
  if (type === 'object') {
    const keys = Object.keys(obj);
    if (keys.length > MAX_INPUT_KEYS) return { valid: false, reason: `object exceeds maximum number of keys (${MAX_INPUT_KEYS})` };
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key)) return { valid: false, reason: `forbidden key "${key}" in input` };
      const r = validateActionInput(obj[key], depth + 1);
      if (!r.valid) return r;
    }
    return { valid: true };
  }
  return { valid: false, reason: `unsupported value type "${type}" in input` };
}

// UUID v4 format validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Middleware: validate :id param is a valid UUID
function validateIdParam(req, res, next) {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: { code: 'INVALID_ID_FORMAT', message: 'Invalid ID format.' } });
  }
  next();
}

// Allowed keys for user preferences
const ALLOWED_PREFERENCE_KEYS = ['timezone', 'theme', 'language', 'notifications', 'smsOptIn'];

// POST /api/chat — send a message, get AI reply
router.post('/chat', requireAuth, chatLimiter, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: { code: 'MESSAGE_REQUIRED', message: 'message is required' } });
    }
    if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
      return res.status(400).json({ error: { code: 'MESSAGE_TOO_LONG', message: `Message exceeds maximum length of ${MAX_CHAT_MESSAGE_LENGTH} characters.` } });
    }
    const reply = await processMessage(req.user, message.trim());
    res.json({ reply });
  } catch (err) {
    console.error('[api] chat error:', err);
    const status = err.statusCode || 500;
    const code = err.statusCode === 429 ? 'TOO_MANY_REQUESTS'
      : err.code === 'ECONNREFUSED' ? 'SERVICE_UNAVAILABLE'
      : err.message?.includes('timeout') ? 'ORCHESTRATOR_TIMEOUT'
      : 'ORCHESTRATOR_ERROR';
    res.status(status).json({ error: { code, message: status === 429 ? 'Server is overloaded — please try again shortly.' : 'Failed to process chat message.' } });
  }
});

// GET /api/workflows — list user's active workflows
router.get('/workflows', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows: workflows, total } = await listWorkflows(req.user.id, { limit, offset });
    res.json({ workflows, total, limit, offset });
  } catch (err) {
    console.error('[api] list workflows error:', err);
    res.status(500).json({ error: { code: 'WORKFLOWS_FETCH_ERROR', message: 'Failed to list workflows.' } });
  }
});

// POST /api/workflows — create + schedule a workflow
router.post('/workflows', requireAuth, async (req, res) => {
  try {
    const { name, trigger_type, cron_expression, trigger_config, actions, description } = req.body;
    if (!name || !trigger_type || !actions) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'name, trigger_type, and actions are required' } });
    }
    if (trigger_type === 'schedule' && cron_expression && !isValidCron(cron_expression)) {
      return res.status(400).json({ error: { code: 'INVALID_CRON', message: 'Invalid cron expression. Expected 5-field format: min hour dom month dow' } });
    }
    if (!Array.isArray(actions)) {
      return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'actions must be an array' } });
    }
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a && a.input !== undefined) {
        if (typeof a.input !== 'object' || Array.isArray(a.input) || a.input === null) {
          return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: `Action ${i} input must be a plain object` } });
        }
        const v = validateActionInput(a.input);
        if (!v.valid) {
          return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: `Action ${i} input rejected: ${v.reason}` } });
        }
      }
    }
    const workflow = await createAndScheduleWorkflow(req.user.id, {
      name, description, trigger_type, cron_expression, trigger_config, actions,
    });
    res.status(201).json({ workflow });
  } catch (err) {
    console.error('[api] create workflow error:', err);
    res.status(500).json({ error: { code: 'WORKFLOW_CREATE_ERROR', message: 'Failed to create workflow.' } });
  }
});

// PATCH /api/workflows/:id/pause — pause/cancel a workflow
router.patch('/workflows/:id/pause', validateIdParam, requireAuth, async (req, res) => {
  try {
    await stopWorkflow(req.params.id, req.user.id);
    res.json({ message: 'Workflow paused' });
  } catch (err) {
    console.error('[api] pause workflow error:', err);
    res.status(500).json({ error: { code: 'WORKFLOW_PAUSE_ERROR', message: 'Failed to pause workflow.' } });
  }
});

// GET /api/apps — connection status for all apps
router.get('/apps', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    // Composio external API does not support cursor-based pagination — pageSize=200
    // is the hard maximum. We fetch the full connected-apps list and paginate in
    // memory. The dataset per user is small (bounded by the number of Composio apps
    // the user has connected, rarely exceeding 200).
    const status = await getConnectionStatus(String(req.user.id));
    const allConnected = status.connected || [];
    const paginated = allConnected.slice(offset, offset + limit);
    res.json({ connected: paginated, missing: status.missing || [], total: allConnected.length, limit, offset });
  } catch (err) {
    console.error('[api] apps status error:', err);
    res.status(500).json({ error: { code: 'APPS_STATUS_ERROR', message: 'Failed to fetch app connection status.' } });
  }
});

// POST /api/notify/register — register Expo push token
router.post('/notify/register', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: { code: 'TOKEN_REQUIRED', message: 'token is required' } });
    }
    await updatePushToken(req.user.id, token);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api] push token register error:', err);
    res.status(500).json({ error: { code: 'PUSH_TOKEN_ERROR', message: 'Failed to register push token.' } });
  }
});

// PATCH /api/workflows/:id — update workflow (pause/resume)
router.patch('/workflows/:id', validateIdParam, requireAuth, async (req, res) => {
  try {
    const { active } = req.body;
    const { query } = require('../db');
    const result = await query(
      'UPDATE workflows SET active = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [active !== false, req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' } });
    res.json({ workflow: result.rows[0] });
  } catch (err) {
    console.error('[api] update workflow error:', err);
    res.status(500).json({ error: { code: 'WORKFLOW_UPDATE_ERROR', message: 'Failed to update workflow.' } });
  }
});

// PATCH /api/user/preferences — update preferences (timezone, etc.)
router.patch('/user/preferences', requireAuth, async (req, res) => {
  try {
    const incomingKeys = Object.keys(req.body);
    const unrecognized = incomingKeys.filter(k => !ALLOWED_PREFERENCE_KEYS.includes(k));
    if (unrecognized.length > 0) {
      return res.status(400).json({ error: { code: 'UNRECOGNIZED_KEYS', message: `Unrecognized preference keys: ${unrecognized.join(', ')}` } });
    }
    const filtered = {};
    for (const key of ALLOWED_PREFERENCE_KEYS) {
      if (key in req.body) filtered[key] = req.body[key];
    }
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ error: { code: 'NO_VALID_KEYS', message: 'No valid preference keys provided' } });
    }
    const updated = await updateUserPreferences(req.user.id, filtered);
    res.json({ user: updated });
  } catch (err) {
    console.error('[api] update preferences error:', err);
    res.status(500).json({ error: { code: 'PREFERENCES_UPDATE_ERROR', message: 'Failed to update preferences.' } });
  }
});

// POST /api/workflows/plan — NL workflow creation
router.post('/workflows/plan', requireAuth, workflowLimiter, async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: { code: 'DESCRIPTION_REQUIRED', message: 'description is required' } });
    }
    const { planAndCreateWorkflows } = require('../services/workflow-planner');
    const workflows = await planAndCreateWorkflows(req.user, description.trim());
    res.status(201).json({ workflows });
  } catch (err) {
    console.error('[api] workflow plan error:', err);
    res.status(500).json({ error: { code: 'WORKFLOW_PLAN_ERROR', message: 'Failed to plan workflow.' } });
  }
});

// POST /api/workflows/:id/run — manually trigger a workflow
router.post('/workflows/:id/run', validateIdParam, requireAuth, workflowLimiter, async (req, res) => {
  try {
    const db = require('../db');
    const result = await db.query('SELECT steps, actions FROM workflows WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const workflow = result.rows[0];
    if (!workflow) return res.status(404).json({ error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' } });

    // Validate workflow data before execution
    const steps = workflow.steps || [];
    const actions = workflow.actions || [];

    if (!Array.isArray(steps)) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'Workflow steps must be an array' } });
    if (!Array.isArray(actions)) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'Workflow actions must be an array' } });
    if (steps.length === 0 && actions.length === 0) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'Workflow has no steps or actions to execute' } });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step || typeof step !== 'object') return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: `Step ${i} is not a valid object` } });
      if (typeof step.description !== 'string' || step.description.trim() === '') return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: `Step ${i} is missing a description` } });
    }

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (!action || typeof action !== 'object') return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: `Action ${i} is not a valid object` } });
      if (typeof action.name !== 'string' || action.name.trim() === '') return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: `Action ${i} is missing a name` } });
      if (!/^[A-Z][A-Z0-9_]*$/.test(action.name)) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: `Action ${i} has an invalid name format` } });
      if (action.input !== undefined && (typeof action.input !== 'object' || Array.isArray(action.input) || action.input === null)) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: `Action ${i} input must be a plain object` } });
      if (action.input !== undefined) {
        const v = validateActionInput(action.input);
        if (!v.valid) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: `Action ${i} input rejected: ${v.reason}` } });
      }
    }

    let runResult;
    if (workflow.steps && workflow.steps.length > 0) {
      const { executeWorkflowAgent } = require('../services/workflow-agent');
      runResult = await executeWorkflowAgent(req.params.id, req.user.id);
    } else {
      const { runWorkflow } = require('../services/workflows');
      runResult = await runWorkflow(req.params.id, req.user.id);
    }
    res.json({ status: 'triggered', result: runResult });
  } catch (err) {
    console.error('[api] workflow run error:', err);
    res.status(500).json({ error: { code: 'WORKFLOW_RUN_ERROR', message: 'Failed to run workflow.' } });
  }
});

// GET /api/templates — search templates
router.get('/templates', requireAuth, async (req, res) => {
  try {
    const { search: searchTerm, category } = req.query;
    const { limit, offset } = parsePagination(req.query);
    const { rows: templates, total } = await require('../services/template-library').search(searchTerm, category, { limit, offset });
    res.json({ templates, total, limit, offset });
  } catch (err) {
    console.error('[api] search templates error:', err);
    res.status(500).json({ error: { code: 'TEMPLATES_SEARCH_ERROR', message: 'Failed to search templates.' } });
  }
});

// POST /api/templates — publish a template
router.post('/templates', requireAuth, async (req, res) => {
  try {
    const template = await require('../services/template-library').publish(req.user.id, req.body);
    res.status(201).json({ template });
  } catch (err) {
    console.error('[api] publish template error:', err);
    res.status(500).json({ error: { code: 'TEMPLATE_PUBLISH_ERROR', message: 'Failed to publish template.' } });
  }
});

// POST /api/templates/:id/instantiate — create workflow from template
router.post('/templates/:id/instantiate', validateIdParam, requireAuth, async (req, res) => {
  try {
    const workflow = await require('../services/template-library').instantiate(req.params.id, req.user.id, req.body);
    res.status(201).json({ workflow });
  } catch (err) {
    console.error('[api] instantiate template error:', err);
    res.status(500).json({ error: { code: 'TEMPLATE_INSTANTIATE_ERROR', message: 'Failed to instantiate template.' } });
  }
});

module.exports = router;
