'use strict';
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const logger = require('../services/logger');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { updatePushToken } = require('../db/queries');
const { processMessage } = require('../services/orchestrator');
const { getConnectionStatus, WINGMAN_APPS } = require('../services/composio');
const { createAndScheduleWorkflow, listWorkflows, stopWorkflow } = require('../services/workflows');
const { updateUserPreferences } = require('../db/queries');
const { isValidCron } = require('../lib/validate-cron');
const { redis } = require('../services/redis');

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

// Chat idempotency — deduplicates concurrent identical requests (double-tap, network retry).
// Key format: wingman:chat-idem:<userId>:<idempotencyKey>
// Values: JSON { status: 'processing' | 'done', reply?: string, error?: object }
const IDEM_PREFIX = 'wingman:chat-idem:';
const IDEM_TTL_SECONDS = 300; // cached result TTL — 5 min to cover delayed retries
const IDEM_ERROR_TTL_SECONDS = 5; // short TTL for errors — catches concurrent double-taps but allows manual retries
const IDEM_POLL_INTERVAL_MS = 250;
const IDEM_POLL_MAX_MS = 130000; // slightly longer than PROCESS_MESSAGE_TIMEOUT (120s)

/**
 * Derive an idempotency key. Prefer client-provided X-Idempotency-Key header;
 * fall back to sha256(trimmed message) so identical rapid retransmissions
 * of the same message are caught automatically.
 */
function deriveIdempotencyKey(req) {
  const header = req.headers['x-idempotency-key'];
  if (header && typeof header === 'string' && header.length > 0 && header.length <= 128) {
    return header;
  }
  return crypto.createHash('sha256').update(req.body.message.trim()).digest('hex').slice(0, 32);
}

// --- Workflow action input sanitization ---
// Whitelist: keys must be alphanumeric with underscores, hyphens, or dots (max 128 chars)
const ALLOWED_KEY_RE = /^[a-zA-Z0-9_\-.]{1,128}$/;
const MAX_INPUT_DEPTH = 5;
const MAX_INPUT_KEYS = 50;
const MAX_STRING_LENGTH = 10000;

/**
 * Validate a workflow action input object.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
function validateActionInput(obj, depth = 0) {
  if (depth > MAX_INPUT_DEPTH) return { valid: false, reason: 'Input is too deeply nested.' };
  if (obj === null || obj === undefined) return { valid: true };

  const type = typeof obj;
  if (type === 'boolean' || type === 'number') {
    if (!Number.isFinite(obj) && type === 'number') return { valid: false, reason: 'Invalid numeric value.' };
    return { valid: true };
  }
  if (type === 'string') {
    if (obj.length > MAX_STRING_LENGTH) return { valid: false, reason: 'A string value is too long.' };
    return { valid: true };
  }
  if (Array.isArray(obj)) {
    if (obj.length > MAX_INPUT_KEYS) return { valid: false, reason: 'An array has too many elements.' };
    for (let i = 0; i < obj.length; i++) {
      const r = validateActionInput(obj[i], depth + 1);
      if (!r.valid) return r;
    }
    return { valid: true };
  }
  if (type === 'object') {
    const keys = Object.keys(obj);
    if (keys.length > MAX_INPUT_KEYS) return { valid: false, reason: 'An object has too many keys.' };
    for (const key of keys) {
      if (!ALLOWED_KEY_RE.test(key)) return { valid: false, reason: 'An object key contains invalid characters.' };
      const r = validateActionInput(obj[key], depth + 1);
      if (!r.valid) return r;
    }
    return { valid: true };
  }
  return { valid: false, reason: 'Input contains an unsupported value type.' };
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

// Allowed keys for user preferences with type/size validation
const PREFERENCE_VALIDATORS = {
  timezone:      v => typeof v === 'string' && v.length <= 100,
  theme:         v => typeof v === 'string' && v.length <= 50,
  language:      v => typeof v === 'string' && v.length <= 20,
  notifications: v => typeof v === 'boolean',
  smsOptIn:      v => typeof v === 'boolean',
};
const ALLOWED_PREFERENCE_KEYS = Object.keys(PREFERENCE_VALIDATORS);

// POST /api/chat — send a message, get AI reply
router.post('/chat', requireAuth, chatLimiter, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: { code: 'MESSAGE_REQUIRED', message: 'message is required' } });
    }
    if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
      return res.status(400).json({ error: { code: 'MESSAGE_TOO_LONG', message: 'Message is too long.' } });
    }

    // --- Idempotency deduplication ---
    const idemKey = deriveIdempotencyKey(req);
    const redisKey = IDEM_PREFIX + req.user.id + ':' + idemKey;

    // Before claiming, check the content-hash alias — catches re-sends where
    // the client generated a new idempotency key (e.g. after navigation cleared
    // the original key) but the first attempt already succeeded server-side.
    const contentHash = crypto.createHash('sha256').update(message.trim()).digest('hex').slice(0, 32);
    const contentHashKey = IDEM_PREFIX + req.user.id + ':' + contentHash;
    if (contentHashKey !== redisKey) {
      try {
        const aliasRaw = await redis.get(contentHashKey);
        if (aliasRaw) {
          const alias = JSON.parse(aliasRaw);
          if (alias.status === 'done' && alias.reply) {
            return res.json({ reply: alias.reply });
          }
        }
      } catch { /* ignore — fall through to normal flow */ }
    }

    // Try to claim this request. SET NX returns 'OK' only for the first caller.
    const claimed = await redis.set(redisKey, JSON.stringify({ status: 'processing' }), 'EX', IDEM_TTL_SECONDS, 'NX');

    if (!claimed) {
      // Another request with the same key is in flight (or already finished).
      // Poll until the first request completes, then return its cached result.
      const start = Date.now();
      while (Date.now() - start < IDEM_POLL_MAX_MS) {
        const raw = await redis.get(redisKey);
        if (raw) {
          try {
            const cached = JSON.parse(raw);
            if (cached.status === 'done') {
              if (cached.error) return res.status(cached.error.status || 500).json({ error: cached.error.body });
              return res.json({ reply: cached.reply });
            }
          } catch { /* corrupted entry — fall through to poll again */ }
        } else {
          // Key expired or was deleted — let this request proceed as a fresh one
          break;
        }
        await new Promise(r => setTimeout(r, IDEM_POLL_INTERVAL_MS));
      }
      // If we broke out because the key vanished, try to claim it again
      const reClaimed = await redis.set(redisKey, JSON.stringify({ status: 'processing' }), 'EX', IDEM_TTL_SECONDS, 'NX');
      if (!reClaimed) {
        // Still couldn't claim — give up
        return res.status(409).json({ error: { code: 'DUPLICATE_REQUEST', message: 'A duplicate request is already being processed.' } });
      }
    }

    // We own this idempotency slot — process the message.
    try {
      const reply = await processMessage(req.user, message.trim());
      const donePayload = JSON.stringify({ status: 'done', reply });
      // Cache the successful result for the TTL window
      await redis.set(redisKey, donePayload, 'EX', IDEM_TTL_SECONDS).catch(e =>
        logger.error({ err: e.message }, '[api] Failed to cache idempotency result')
      );
      // Also cache under the content-hash key so that re-sends with a different
      // client-provided key (e.g. after navigation cleared the original) still
      // hit the cached result instead of creating a duplicate.
      if (contentHashKey !== redisKey) {
        await redis.set(contentHashKey, donePayload, 'EX', IDEM_TTL_SECONDS).catch(e =>
          logger.error({ err: e.message }, '[api] Failed to cache content-hash idempotency alias')
        );
      }
      res.json({ reply });
    } catch (err) {
      const status = err.statusCode || 500;
      const code = err.statusCode === 429 ? 'TOO_MANY_REQUESTS'
        : err.code === 'ECONNREFUSED' ? 'SERVICE_UNAVAILABLE'
        : err.message?.includes('timeout') ? 'ORCHESTRATOR_TIMEOUT'
        : 'ORCHESTRATOR_ERROR';
      const errorBody = { code, message: status === 429 ? 'Server is overloaded — please try again shortly.' : 'Failed to process chat message.' };
      // Cache the error with a short TTL — long enough to catch concurrent
      // duplicate submissions but short enough to allow manual retries.
      await redis.set(redisKey, JSON.stringify({ status: 'done', error: { status, body: errorBody } }), 'EX', IDEM_ERROR_TTL_SECONDS).catch(e =>
        logger.error({ err: e.message }, '[api] Failed to cache idempotency error')
      );
      logger.error({ err: err.message }, '[api] chat error');
      res.status(status).json({ error: errorBody });
    }
  } catch (err) {
    logger.error({ err: err.message }, '[api] chat error');
    res.status(500).json({ error: { code: 'ORCHESTRATOR_ERROR', message: 'Failed to process chat message.' } });
  }
});

// GET /api/workflows — list user's active workflows
router.get('/workflows', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows: workflows, total } = await listWorkflows(req.user.id, { limit, offset });
    res.json({ workflows, total, limit, offset });
  } catch (err) {
    logger.error({ err: err.message }, '[api] list workflows error');
    res.status(500).json({ error: { code: 'WORKFLOWS_FETCH_ERROR', message: 'Failed to list workflows.' } });
  }
});

// POST /api/workflows — create + schedule a workflow
router.post('/workflows', requireAuth, async (req, res) => {
  try {
    const { name, trigger_type, cron_expression, trigger_config, actions, description } = req.body;
    if (!name || !trigger_type || !actions) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Required fields are missing.' } });
    }
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200) {
      return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'Invalid workflow name.' } });
    }
    if (description !== undefined && description !== null) {
      if (typeof description !== 'string' || description.length > 2000) {
        return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'Invalid workflow description.' } });
      }
    }
    if (trigger_type === 'schedule') {
      if (!cron_expression) {
        return res.status(400).json({ error: { code: 'MISSING_CRON', message: 'Schedule configuration is incomplete.' } });
      }
      if (!isValidCron(cron_expression)) {
        return res.status(400).json({ error: { code: 'INVALID_CRON', message: 'Invalid schedule expression.' } });
      }
    }
    if (trigger_config !== undefined && trigger_config !== null) {
      if (typeof trigger_config !== 'object' || Array.isArray(trigger_config)) {
        return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'Invalid trigger configuration.' } });
      }
      const tc = validateActionInput(trigger_config);
      if (!tc.valid) {
        return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'Invalid trigger configuration.' } });
      }
    }
    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'Invalid or missing actions.' } });
    }
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a && a.input !== undefined) {
        if (typeof a.input !== 'object' || Array.isArray(a.input) || a.input === null) {
          return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'An action has an invalid input format.' } });
        }
        const v = validateActionInput(a.input);
        if (!v.valid) {
          return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'An action input failed validation.' } });
        }
      }
    }
    const workflow = await createAndScheduleWorkflow(req.user.id, {
      name, description, trigger_type, cron_expression, trigger_config, actions,
    });
    res.status(201).json({ workflow });
  } catch (err) {
    logger.error({ err: err.message }, '[api] create workflow error');
    res.status(500).json({ error: { code: 'WORKFLOW_CREATE_ERROR', message: 'Failed to create workflow.' } });
  }
});

// PATCH /api/workflows/:id/pause — pause/cancel a workflow
router.patch('/workflows/:id/pause', validateIdParam, requireAuth, async (req, res) => {
  try {
    await stopWorkflow(req.params.id, req.user.id);
    res.json({ message: 'Workflow paused' });
  } catch (err) {
    logger.error({ err: err.message }, '[api] pause workflow error');
    res.status(500).json({ error: { code: 'WORKFLOW_PAUSE_ERROR', message: 'Failed to pause workflow.' } });
  }
});

// GET /api/apps — connection status for all apps
router.get('/apps', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    // Delegate pagination to Composio API so we only fetch the requested page.
    const page = Math.floor(offset / limit) + 1;
    const status = await getConnectionStatus(String(req.user.id), null, { page, pageSize: limit });
    const connected = status.connected || [];
    res.json({ connected, missing: status.missing || [], total: status.total || connected.length, limit, offset });
  } catch (err) {
    logger.error({ err: err.message }, '[api] apps status error');
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
    // Validate push token format: Expo, FCM, or APNs tokens only
    const EXPO_TOKEN_RE = /^ExponentPushToken\[[A-Za-z0-9_\-]{20,80}\]$/;
    const FCM_APNS_TOKEN_RE = /^[A-Za-z0-9_\-:.]{20,256}$/;
    if (!EXPO_TOKEN_RE.test(token) && !FCM_APNS_TOKEN_RE.test(token)) {
      return res.status(400).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid push token format.' } });
    }
    await updatePushToken(req.user.id, token);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: err.message }, '[api] push token register error');
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
    logger.error({ err: err.message }, '[api] update workflow error');
    res.status(500).json({ error: { code: 'WORKFLOW_UPDATE_ERROR', message: 'Failed to update workflow.' } });
  }
});

// PATCH /api/user/preferences — update preferences (timezone, etc.)
router.patch('/user/preferences', requireAuth, async (req, res) => {
  try {
    const incomingKeys = Object.keys(req.body);
    const unrecognized = incomingKeys.filter(k => !ALLOWED_PREFERENCE_KEYS.includes(k));
    if (unrecognized.length > 0) {
      return res.status(400).json({ error: { code: 'UNRECOGNIZED_KEYS', message: 'One or more preference keys are not recognized.' } });
    }
    const filtered = {};
    const invalid = [];
    for (const key of ALLOWED_PREFERENCE_KEYS) {
      if (key in req.body) {
        if (PREFERENCE_VALIDATORS[key](req.body[key])) {
          filtered[key] = req.body[key];
        } else {
          invalid.push(key);
        }
      }
    }
    if (invalid.length > 0) {
      return res.status(422).json({ error: { code: 'INVALID_PREFERENCE_VALUE', message: 'One or more preference values are invalid.' } });
    }
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ error: { code: 'NO_VALID_KEYS', message: 'No valid preference keys provided' } });
    }
    const updated = await updateUserPreferences(req.user.id, filtered);
    res.json({ user: updated });
  } catch (err) {
    logger.error({ err: err.message }, '[api] update preferences error');
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
    const warnings = workflows.flatMap(w => w.warnings || []);
    const response = { workflows };
    if (warnings.length > 0) {
      response.warnings = warnings;
    }
    res.status(201).json(response);
  } catch (err) {
    logger.error({ err: err.message }, '[api] workflow plan error');
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

    if (!Array.isArray(steps)) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'Workflow data is malformed.' } });
    if (!Array.isArray(actions)) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'Workflow data is malformed.' } });
    if (steps.length === 0 && actions.length === 0) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'Workflow has no executable content.' } });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step || typeof step !== 'object') return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'A workflow step is invalid.' } });
      const stepText = step.description || step.instruction;
      if (typeof stepText !== 'string' || stepText.trim() === '') return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'A workflow step is invalid.' } });
    }

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (!action || typeof action !== 'object') return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'A workflow action is invalid.' } });
      if (typeof action.name !== 'string' || action.name.trim() === '') return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'A workflow action is invalid.' } });
      if (!/^[A-Z][A-Z0-9_]*$/.test(action.name)) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'A workflow action is invalid.' } });
      if (action.input !== undefined && (typeof action.input !== 'object' || Array.isArray(action.input) || action.input === null)) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'A workflow action has invalid input.' } });
      if (action.input !== undefined) {
        const v = validateActionInput(action.input);
        if (!v.valid) return res.status(422).json({ error: { code: 'INVALID_WORKFLOW', message: 'A workflow action input failed validation.' } });
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
    logger.error({ err: err.message }, '[api] workflow run error');
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
    logger.error({ err: err.message }, '[api] search templates error');
    res.status(500).json({ error: { code: 'TEMPLATES_SEARCH_ERROR', message: 'Failed to search templates.' } });
  }
});

// POST /api/templates — publish a template
router.post('/templates', requireAuth, async (req, res) => {
  try {
    const { name, description, category, steps, variables } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 200) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid template name.' } });
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0 || description.trim().length > 1000) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid template description.' } });
    }
    const ALLOWED_CATEGORIES = ['productivity', 'messaging', 'finance', 'marketing', 'smart-home', 'other'];
    if (!category || !ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid or missing category.' } });
    }
    if (!Array.isArray(steps) || steps.length === 0 || steps.length > 20) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid steps.' } });
    }
    for (const step of steps) {
      if (!step || typeof step.instruction !== 'string' || step.instruction.trim().length === 0 || step.instruction.trim().length > 500) {
        return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'A step has an invalid instruction.' } });
      }
    }
    if (variables !== undefined && (typeof variables !== 'object' || variables === null || Array.isArray(variables))) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'variables must be a plain object if provided.' } });
    }

    // Only allow whitelisted fields — system_prompt is forbidden for user-published templates
    const sanitized = {
      name: name.trim(),
      description: description.trim(),
      category,
      steps: steps.map(s => ({ instruction: s.instruction.trim() })),
      variables: variables || {},
    };

    const template = await require('../services/template-library').publish(req.user.id, sanitized);
    res.status(201).json({ template });
  } catch (err) {
    logger.error({ err: err.message }, '[api] publish template error');
    res.status(500).json({ error: { code: 'TEMPLATE_PUBLISH_ERROR', message: 'Failed to publish template.' } });
  }
});

// POST /api/templates/:id/instantiate — create workflow from template
router.post('/templates/:id/instantiate', validateIdParam, requireAuth, async (req, res) => {
  try {
    // Whitelist only the keys that instantiate() actually uses
    const { name, trigger_type, cron_expression, variables } = req.body || {};
    const overrides = {};
    if (typeof name === 'string' && name.length <= 200) overrides.name = name.trim();
    if (typeof trigger_type === 'string' && ['manual', 'cron', 'webhook'].includes(trigger_type)) overrides.trigger_type = trigger_type;
    if (typeof cron_expression === 'string' && cron_expression.length <= 100) overrides.cron_expression = cron_expression;
    if (variables != null && typeof variables === 'object' && !Array.isArray(variables)) {
      // Only allow string values in variables to prevent injection of nested objects
      const safe = {};
      for (const [k, v] of Object.entries(variables)) {
        if (typeof k === 'string' && k.length <= 100 && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
          safe[k] = v;
        }
      }
      overrides.variables = safe;
    }
    const workflow = await require('../services/template-library').instantiate(req.params.id, req.user.id, overrides);
    res.status(201).json({ workflow });
  } catch (err) {
    logger.error({ err: err.message }, '[api] instantiate template error');
    res.status(500).json({ error: { code: 'TEMPLATE_INSTANTIATE_ERROR', message: 'Failed to instantiate template.' } });
  }
});

module.exports = router;
