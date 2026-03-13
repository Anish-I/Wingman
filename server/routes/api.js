'use strict';
const express = require('express');
const router = express.Router();
const { verifyToken } = require('./auth');
const { getUserById, updatePushToken } = require('../db/queries');
const { processMessage } = require('../services/orchestrator');
const { getConnectionStatus, WINGMAN_APPS } = require('../services/composio');
const { createAndScheduleWorkflow, listWorkflows, stopWorkflow } = require('../services/workflows');
const { updateUserPreferences } = require('../db/queries');

// Middleware: parse Bearer token → req.user
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required.' });
  }
  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  const user = await getUserById(payload.userId).catch(() => null);
  if (!user) return res.status(401).json({ error: 'User not found.' });
  req.user = user;
  next();
}

// POST /api/chat — send a message, get AI reply
router.post('/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    const reply = await processMessage(req.user, message.trim());
    res.json({ reply });
  } catch (err) {
    console.error('[api] chat error:', err.message);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// GET /api/workflows — list user's active workflows
router.get('/workflows', requireAuth, async (req, res) => {
  try {
    const workflows = await listWorkflows(req.user.id);
    res.json({ workflows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workflows — create + schedule a workflow
router.post('/workflows', requireAuth, async (req, res) => {
  try {
    const { name, trigger_type, cron_expression, trigger_config, actions, description } = req.body;
    if (!name || !trigger_type || !actions) {
      return res.status(400).json({ error: 'name, trigger_type, and actions are required' });
    }
    const workflow = await createAndScheduleWorkflow(req.user.id, {
      name, description, trigger_type, cron_expression, trigger_config, actions,
    });
    res.status(201).json({ workflow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/workflows/:id/pause — pause/cancel a workflow
router.patch('/workflows/:id/pause', requireAuth, async (req, res) => {
  try {
    await stopWorkflow(req.params.id, req.user.id);
    res.json({ message: 'Workflow paused' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/apps — connection status for all apps
router.get('/apps', requireAuth, async (req, res) => {
  try {
    const status = await getConnectionStatus(String(req.user.id));
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notify/register — register Expo push token
router.post('/notify/register', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }
    await updatePushToken(req.user.id, token);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/workflows/:id — update workflow (pause/resume)
router.patch('/workflows/:id', requireAuth, async (req, res) => {
  try {
    const { active } = req.body;
    const { query } = require('../db');
    const result = await query(
      'UPDATE workflows SET active = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [active !== false, req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ workflow: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/user/preferences — update preferences (timezone, etc.)
router.patch('/user/preferences', requireAuth, async (req, res) => {
  try {
    const updated = await updateUserPreferences(req.user.id, req.body);
    res.json({ user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/templates — search templates
router.get('/templates', requireAuth, async (req, res) => {
  try {
    const { search: searchTerm, category } = req.query;
    const templates = await require('../services/template-library').search(searchTerm, category);
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates — publish a template
router.post('/templates', requireAuth, async (req, res) => {
  try {
    const template = await require('../services/template-library').publish(req.user.id, req.body);
    res.status(201).json({ template });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/:id/instantiate — create workflow from template
router.post('/templates/:id/instantiate', requireAuth, async (req, res) => {
  try {
    const workflow = await require('../services/template-library').instantiate(req.params.id, req.user.id, req.body);
    res.status(201).json({ workflow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
