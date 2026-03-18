const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('./auth');
const { redis } = require('../services/redis');
const { getConnectionStatus, getConnectionLink, invalidateToolsCache, WINGMAN_APPS } = require('../services/composio');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
const CONNECT_TOKEN_TTL = 300; // 5 minutes

// Generate a signed, time-limited state token for OAuth callbacks
function generateOAuthState(userId, app) {
  return jwt.sign({ userId, app }, JWT_SECRET, { expiresIn: '10m' });
}

// Verify and decode an OAuth state token
function verifyOAuthState(stateToken) {
  try {
    return jwt.verify(stateToken, JWT_SECRET);
  } catch {
    return null;
  }
}

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

// POST /connect/create-connect-token — generate a short-lived, single-use token for OAuth initiation
// This avoids exposing session JWTs in URL query parameters (fixes M1 in security audit)
router.post('/create-connect-token', requireAuth, async (req, res) => {
  try {
    const { app } = req.body;
    if (!app || typeof app !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid app parameter.' });
    }
    const connectToken = crypto.randomBytes(32).toString('hex');
    const key = `connect_token:${connectToken}`;
    await redis.set(key, JSON.stringify({ userId: req.user.userId, app: app.toLowerCase() }), 'EX', CONNECT_TOKEN_TTL);
    res.json({ connectToken });
  } catch (err) {
    console.error('[connect] create-connect-token error:', err);
    res.status(500).json({ error: 'Failed to create connect token.' });
  }
});

// GET /connect/initiate — initiate OAuth with single-use connect token
router.get('/initiate', async (req, res) => {
  try {
    const { connectToken } = req.query;
    if (!connectToken) {
      return res.status(400).json({ error: 'Missing connectToken parameter.' });
    }
    // Look up and consume the single-use token from Redis
    const key = `connect_token:${connectToken}`;
    const stored = await redis.get(key);
    if (!stored) {
      return res.status(401).json({ error: 'Invalid or expired connect token.' });
    }
    // Delete immediately — single use
    await redis.del(key);
    const { userId, app } = JSON.parse(stored);
    const state = generateOAuthState(userId, app);
    const redirectUrl = `${BASE_URL}/connect/callback?state=${state}`;
    const url = await getConnectionLink(userId, app, redirectUrl);
    res.redirect(url);
  } catch (err) {
    console.error('Connection initiate error:', err);
    res.status(500).json({ error: 'Failed to generate connection link.' });
  }
});

// GET /connect/callback — Composio redirects here after OAuth
router.get('/callback', async (req, res) => {
  try {
    const { state } = req.query;
    if (!state) {
      return res.status(400).send('Missing state parameter.');
    }
    const payload = verifyOAuthState(state);
    if (!payload) {
      return res.status(400).send('Invalid or expired OAuth state token.');
    }
    const { userId, app: appName } = payload;
    if (userId) {
      await invalidateToolsCache(userId);
    }
    res.redirect(`${WEB_URL}/connect/success?app=${appName || ''}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Something went wrong.');
  }
});

// POST /connect/disconnect — disconnect app (Bearer auth)
router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    const { app } = req.body;
    if (!app || typeof app !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid app parameter.' });
    }
    const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
    const entityId = String(req.user.userId);
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
    await invalidateToolsCache(req.user.userId);
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
    const state = generateOAuthState(req.user.userId, app);
    const redirectUrl = `${BASE_URL}/connect/callback?state=${state}`;
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
