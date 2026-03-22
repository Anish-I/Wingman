const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const requireAuth = require('../middleware/requireAuth');
const { redis } = require('../services/redis');
const { getConnectionStatus, getConnectionLink, invalidateToolsCache, WINGMAN_APPS } = require('../services/composio');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
const CONNECT_TOKEN_TTL = 300; // 5 minutes

// HMAC to bind OAuth callback to the browser that initiated the flow (IDOR fix)
function computeStateHmac(state) {
  return crypto.createHmac('sha256', JWT_SECRET).update(state).digest('hex');
}

const OAUTH_COOKIE_NAME = 'oauth_state_hmac';
const OAUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 10 * 60 * 1000, // 10 minutes, matches state JWT expiry
  path: '/connect/callback',
};

// Generate a signed, time-limited state token for OAuth callbacks.
// Includes a random nonce stored in Redis to tie the token to a server-side session (CSRF protection).
async function generateOAuthState(userId, app) {
  const nonce = crypto.randomBytes(32).toString('hex');
  await redis.set(`oauth_nonce:${nonce}`, '1', 'EX', 600); // 10-minute TTL matching JWT expiry
  return jwt.sign({ userId, app, nonce }, JWT_SECRET, { expiresIn: '10m' });
}

// Verify and decode an OAuth state token, consuming the server-side nonce (single-use)
async function verifyOAuthState(stateToken) {
  try {
    const payload = jwt.verify(stateToken, JWT_SECRET);
    if (!payload.nonce) return null;
    // Atomically fetch and delete nonce — prevents replay
    const nonceExists = await redis.call('GETDEL', `oauth_nonce:${payload.nonce}`);
    if (!nonceExists) return null;
    return payload;
  } catch {
    return null;
  }
}

const WEB_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// GET /connect/status — list connected & missing apps (Bearer auth)
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await getConnectionStatus(req.user.id, WINGMAN_APPS);
    res.json(status);
  } catch (err) {
    console.error('Connection status error:', err);
    res.status(500).json({ error: { code: 'CONNECTION_STATUS_ERROR', message: 'Failed to fetch connection status.' } });
  }
});

// POST /connect/create-connect-token — generate a short-lived, single-use token for OAuth initiation
// This avoids exposing session JWTs in URL query parameters (fixes M1 in security audit)
router.post('/create-connect-token', requireAuth, async (req, res) => {
  try {
    const { app } = req.body;
    if (!app || typeof app !== 'string') {
      return res.status(400).json({ error: { code: 'INVALID_APP', message: 'Missing or invalid app parameter.' } });
    }
    const connectToken = crypto.randomBytes(32).toString('hex');
    const key = `connect_token:${connectToken}`;
    await redis.set(key, JSON.stringify({ userId: req.user.id, app: app.toLowerCase() }), 'EX', CONNECT_TOKEN_TTL);
    res.json({ connectToken });
  } catch (err) {
    console.error('[connect] create-connect-token error:', err);
    res.status(500).json({ error: { code: 'CONNECT_TOKEN_ERROR', message: 'Failed to create connect token.' } });
  }
});

// GET /connect/initiate — initiate OAuth with single-use connect token
router.get('/initiate', async (req, res) => {
  try {
    const { connectToken } = req.query;
    if (!connectToken) {
      return res.status(400).json({ error: { code: 'MISSING_CONNECT_TOKEN', message: 'Missing connectToken parameter.' } });
    }
    // Look up and consume the single-use token from Redis
    const key = `connect_token:${connectToken}`;
    const stored = await redis.get(key);
    if (!stored) {
      return res.status(401).json({ error: { code: 'INVALID_CONNECT_TOKEN', message: 'Invalid or expired connect token.' } });
    }
    // Delete immediately — single use
    await redis.del(key);
    const { userId, app } = JSON.parse(stored);
    const state = await generateOAuthState(userId, app);
    const redirectUrl = `${BASE_URL}/connect/callback?state=${state}`;
    const url = await getConnectionLink(userId, app, redirectUrl);
    res.cookie(OAUTH_COOKIE_NAME, computeStateHmac(state), OAUTH_COOKIE_OPTS);
    res.redirect(url);
  } catch (err) {
    console.error('Connection initiate error:', err);
    res.status(500).json({ error: { code: 'CONNECTION_LINK_ERROR', message: 'Failed to generate connection link.' } });
  }
});

// GET /connect/callback — Composio redirects here after OAuth
router.get('/callback', async (req, res) => {
  try {
    const { state } = req.query;
    if (!state) {
      return res.status(400).json({ error: { code: 'MISSING_STATE', message: 'Missing state parameter.' } });
    }
    // Verify the callback is from the same browser that initiated the flow (IDOR fix)
    const cookieHmac = req.cookies && req.cookies[OAUTH_COOKIE_NAME];
    const expectedHmac = computeStateHmac(state);
    if (!cookieHmac || cookieHmac.length !== expectedHmac.length ||
        !crypto.timingSafeEqual(Buffer.from(cookieHmac), Buffer.from(expectedHmac))) {
      return res.status(403).json({ error: { code: 'OAUTH_SESSION_MISMATCH', message: 'OAuth session mismatch. Please retry the connection from your app.' } });
    }
    res.clearCookie(OAUTH_COOKIE_NAME, { path: '/connect/callback' });
    const payload = await verifyOAuthState(state);
    if (!payload) {
      return res.status(400).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'Invalid or expired OAuth state token.' } });
    }
    const { userId, app: appName } = payload;
    if (userId) {
      await invalidateToolsCache(userId);
    }
    res.redirect(`${WEB_URL}/connect/success?app=${appName || ''}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: { code: 'OAUTH_CALLBACK_ERROR', message: 'Something went wrong.' } });
  }
});

// POST /connect/disconnect — disconnect app (Bearer auth)
router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    const { app } = req.body;
    if (!app || typeof app !== 'string') {
      return res.status(400).json({ error: { code: 'INVALID_APP', message: 'Missing or invalid app parameter.' } });
    }
    const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
    const entityId = String(req.user.id);
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
    await invalidateToolsCache(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Disconnect error:', err);
    res.status(500).json({ error: { code: 'DISCONNECT_ERROR', message: 'Failed to disconnect app.' } });
  }
});

// GET /connect/:app — generate OAuth link and redirect (Bearer auth)
router.get('/:app', requireAuth, async (req, res) => {
  try {
    const app = req.params.app.toLowerCase();
    const state = await generateOAuthState(req.user.id, app);
    const redirectUrl = `${BASE_URL}/connect/callback?state=${state}`;
    const url = await getConnectionLink(req.user.id, app, redirectUrl);
    res.cookie(OAUTH_COOKIE_NAME, computeStateHmac(state), OAUTH_COOKIE_OPTS);
    res.redirect(url);
  } catch (err) {
    console.error('Connection link error:', err);
    res.status(500).json({ error: { code: 'CONNECTION_LINK_ERROR', message: 'Failed to generate connection link.' } });
  }
});

// DELETE /connect/:app — disconnect app (Bearer auth)
router.delete('/:app', requireAuth, async (req, res) => {
  try {
    const app = req.params.app.toLowerCase();
    const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
    const entityId = String(req.user.id);
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
    await invalidateToolsCache(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Disconnect error:', err);
    res.status(500).json({ error: { code: 'DISCONNECT_ERROR', message: 'Failed to disconnect app.' } });
  }
});

module.exports = router;
