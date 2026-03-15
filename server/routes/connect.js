const express = require('express');
const { verifyToken } = require('./auth');
const { getConnectionStatus, getConnectionLink, invalidateToolsCache, WINGMAN_APPS } = require('../services/composio');

const router = express.Router();

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
const WEB_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

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

// GET /connect/status — list connected & missing apps (Bearer auth)
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await getConnectionStatus(req.user.userId, WINGMAN_APPS);
    res.json(status);
  } catch (err) {
    console.error('Connection status error:', err);
    res.status(500).json({ error: 'Failed to fetch connection status.' });
  }
});

// GET /connect/status/:token — list connected & missing apps (token in path)
router.get('/status/:token', async (req, res) => {
  try {
    const payload = verifyToken(req.params.token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    const status = await getConnectionStatus(payload.userId, WINGMAN_APPS);
    res.json(status);
  } catch (err) {
    console.error('Connection status error:', err);
    res.status(500).json({ error: 'Failed to fetch connection status.' });
  }
});

// GET /connect/initiate — initiate OAuth with token in query param
router.get('/initiate', async (req, res) => {
  try {
    const { app, token } = req.query;
    if (!app || !token) {
      return res.status(400).json({ error: 'Missing app or token parameter.' });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    const redirectUrl = `${BASE_URL}/connect/callback?userId=${payload.userId}&app=${app}`;
    const url = await getConnectionLink(payload.userId, app.toLowerCase(), redirectUrl);
    res.redirect(url);
  } catch (err) {
    console.error('Connection initiate error:', err);
    res.status(500).json({ error: 'Failed to generate connection link.' });
  }
});

// GET /connect/callback — Composio redirects here after OAuth
router.get('/callback', async (req, res) => {
  try {
    const userId = req.query.userId;
    const appName = req.query.app || '';
    if (userId) {
      await invalidateToolsCache(userId);
    }
    res.redirect(`${WEB_URL}/connect/success?app=${appName}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Something went wrong.');
  }
});

// POST /connect/disconnect — disconnect app (frontend expects POST)
router.post('/disconnect', async (req, res) => {
  try {
    const { app, token } = req.body;
    if (!app || !token) {
      return res.status(400).json({ error: 'Missing app or token parameter.' });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    // Composio doesn't have a direct disconnect API via SDK,
    // but we can call the REST API to delete the connected account
    const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
    const entityId = String(payload.userId);
    const listUrl = `https://backend.composio.dev/api/v1/connectedAccounts?user_uuid=${entityId}&pageSize=200`;
    const listRes = await fetch(listUrl, { headers: { 'x-api-key': COMPOSIO_API_KEY } });
    if (listRes.ok) {
      const data = await listRes.json();
      const account = (data.items || []).find(
        c => c.appName.toLowerCase() === app.toLowerCase() && c.status === 'ACTIVE'
      );
      if (account) {
        await fetch(`https://backend.composio.dev/api/v1/connectedAccounts/${account.id}`, {
          method: 'DELETE',
          headers: { 'x-api-key': COMPOSIO_API_KEY },
        });
      }
    }
    await invalidateToolsCache(payload.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect app.' });
  }
});

// GET /connect/:app — generate OAuth link and redirect (Bearer auth)
router.get('/:app', requireAuth, async (req, res) => {
  try {
    const app = req.params.app.toLowerCase();
    const redirectUrl = `${BASE_URL}/connect/callback?userId=${req.user.userId}&app=${app}`;
    const url = await getConnectionLink(req.user.userId, app, redirectUrl);
    res.redirect(url);
  } catch (err) {
    console.error('Connection link error:', err);
    res.status(500).json({ error: 'Failed to generate connection link.' });
  }
});

// DELETE /connect/:app — disconnect app (Bearer auth)
router.delete('/:app', requireAuth, async (req, res) => {
  try {
    const app = req.params.app.toLowerCase();
    const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
    const entityId = String(req.user.userId);
    const listUrl = `https://backend.composio.dev/api/v1/connectedAccounts?user_uuid=${entityId}&pageSize=200`;
    const listRes = await fetch(listUrl, { headers: { 'x-api-key': COMPOSIO_API_KEY } });
    if (listRes.ok) {
      const data = await listRes.json();
      const account = (data.items || []).find(
        c => c.appName.toLowerCase() === app && c.status === 'ACTIVE'
      );
      if (account) {
        await fetch(`https://backend.composio.dev/api/v1/connectedAccounts/${account.id}`, {
          method: 'DELETE',
          headers: { 'x-api-key': COMPOSIO_API_KEY },
        });
      }
    }
    await invalidateToolsCache(req.user.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect app.' });
  }
});

module.exports = router;
