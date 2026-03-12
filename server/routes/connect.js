const express = require('express');
const { verifyToken } = require('./auth');
const { getConnectionStatus, getConnectionLink, invalidateToolsCache, WINGMAN_APPS } = require('../services/composio');

const router = express.Router();

// Auth middleware — reuses verifyToken from auth.js
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required.' });
  }
  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  req.user = payload;
  next();
}

// GET /connect/status — list connected & missing apps
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await getConnectionStatus(req.user.userId, WINGMAN_APPS);
    res.json(status);
  } catch (err) {
    console.error('Connection status error:', err);
    res.status(500).json({ error: 'Failed to fetch connection status.' });
  }
});

// GET /connect/callback — Composio redirects here after OAuth
router.get('/callback', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (userId) {
      await invalidateToolsCache(userId);
    }
    res.send('<html><body><h1>Connected!</h1><p>You can close this tab and return to SMS.</p></body></html>');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Something went wrong.');
  }
});

// GET /connect/:app — generate OAuth link and redirect
router.get('/:app', requireAuth, async (req, res) => {
  try {
    const app = req.params.app.toLowerCase();
    const url = await getConnectionLink(req.user.userId, app);
    res.redirect(url);
  } catch (err) {
    console.error('Connection link error:', err);
    res.status(500).json({ error: 'Failed to generate connection link.' });
  }
});

// DELETE /connect/:app — not yet implemented
router.delete('/:app', requireAuth, (req, res) => {
  res.status(501).json({ error: 'Disconnect not implemented yet.' });
});

module.exports = router;
