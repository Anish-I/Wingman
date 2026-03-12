'use strict';
const express = require('express');
const router = express.Router();
const { verifyToken } = require('./auth');
const { getUserById } = require('../db/queries');
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

// GET /api/apps — list connected + missing apps
router.get('/apps', requireAuth, async (req, res) => {
  try {
    const status = await getConnectionStatus(String(req.user.id), WINGMAN_APPS);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notify/register — save FCM push token
router.post('/notify/register', requireAuth, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ error: 'fcmToken required' });
    const prefs = { ...(req.user.preferences || {}), fcmToken };
    await updateUserPreferences(req.user.id, prefs);
    res.json({ message: 'Token registered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
