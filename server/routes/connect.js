const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../services/logger');
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
  // Store userId alongside nonce so callback can verify the state token wasn't forged for a different user
  await redis.set(`oauth_nonce:${nonce}`, String(userId), 'EX', 600); // 10-minute TTL matching JWT expiry
  return jwt.sign({ userId, app, nonce }, JWT_SECRET, { expiresIn: '10m' });
}

// Lua script: atomically consume the OAuth nonce AND invalidate the tools cache.
// This closes the race window where concurrent /connect/status reads could
// re-populate stale cache between nonce consumption and cache invalidation.
// KEYS[1] = oauth_nonce:{nonce}, KEYS[2] = tools:{userId}
// ARGV[1] = expected userId string
// Returns the stored userId if valid, nil otherwise.
const VERIFY_AND_INVALIDATE_LUA = `
local storedUserId = redis.call('GETDEL', KEYS[1])
if not storedUserId then return nil end
if storedUserId ~= ARGV[1] then return nil end
redis.call('DEL', KEYS[2])
return storedUserId
`;

// Verify and decode an OAuth state token, atomically consuming the nonce
// and invalidating the tools cache in a single Redis round-trip.
async function verifyOAuthState(stateToken) {
  try {
    const payload = jwt.verify(stateToken, JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload.nonce) return null;
    const nonceKey = `oauth_nonce:${payload.nonce}`;
    const cacheKey = `tools:${payload.userId}`;
    const expectedUserId = String(payload.userId);
    // Single atomic Redis operation: consume nonce + invalidate tools cache
    const storedUserId = await redis.eval(
      VERIFY_AND_INVALIDATE_LUA, 2, nonceKey, cacheKey, expectedUserId
    );
    if (!storedUserId) return null;
    return payload;
  } catch {
    return null;
  }
}

const WEB_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Validate app name to prevent injection into Composio API paths
function isValidAppName(app) {
  return typeof app === 'string' && /^[a-z0-9_]+$/.test(app) && WINGMAN_APPS.includes(app);
}

// GET /connect/status — list connected & missing apps (Bearer auth)
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await getConnectionStatus(req.user.id, WINGMAN_APPS);
    res.json(status);
  } catch (err) {
    logger.error({ err: err.message }, 'Connection status error');
    res.status(500).json({ error: { code: 'CONNECTION_STATUS_ERROR', message: 'Failed to fetch connection status.' } });
  }
});

// POST /connect/create-connect-token — generate a short-lived, single-use token for OAuth initiation
// This avoids exposing session JWTs in URL query parameters (fixes M1 in security audit)
router.post('/create-connect-token', requireAuth, async (req, res) => {
  try {
    const { app } = req.body;
    if (!app || !isValidAppName(app.toLowerCase())) {
      return res.status(400).json({ error: { code: 'INVALID_APP', message: 'Missing or invalid app parameter.' } });
    }
    const connectToken = crypto.randomBytes(32).toString('hex');
    const key = `connect_token:${connectToken}`;
    await redis.set(key, JSON.stringify({ userId: req.user.id, app: app.toLowerCase() }), 'EX', CONNECT_TOKEN_TTL);
    res.json({ connectToken });
  } catch (err) {
    logger.error({ err: err.message }, '[connect] create-connect-token error');
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
    // Atomically fetch and delete — prevents concurrent requests from reusing the same token
    const key = `connect_token:${connectToken}`;
    const stored = await redis.call('GETDEL', key);
    if (!stored) {
      return res.status(401).json({ error: { code: 'INVALID_CONNECT_TOKEN', message: 'Invalid or expired connect token.' } });
    }
    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch {
      logger.error('Corrupt connect_token payload in Redis');
      return res.status(500).json({ error: { code: 'CONNECTION_LINK_ERROR', message: 'Failed to process connect token.' } });
    }
    const { userId, app } = parsed;
    const state = await generateOAuthState(userId, app);
    const redirectUrl = `${BASE_URL}/connect/callback?state=${state}`;
    const url = await getConnectionLink(userId, app, redirectUrl);
    res.cookie(OAUTH_COOKIE_NAME, computeStateHmac(state), OAUTH_COOKIE_OPTS);
    res.redirect(url);
  } catch (err) {
    logger.error({ err: err.message }, 'Connection initiate error');
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

    // verifyOAuthState atomically consumes the nonce AND invalidates the
    // tools cache in a single Lua script, so there is no window where
    // concurrent /connect/status can read stale cache.
    const payload = await verifyOAuthState(state);
    if (!payload) {
      return res.status(400).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'Invalid or expired OAuth state token.' } });
    }
    const { app: appName } = payload;
    res.redirect(`${WEB_URL}/connect/success?app=${appName || ''}`);
  } catch (err) {
    logger.error({ err: err.message }, 'OAuth callback error');
    res.status(500).json({ error: { code: 'OAUTH_CALLBACK_ERROR', message: 'Something went wrong.' } });
  }
});

// POST /connect/disconnect — disconnect app (Bearer auth)
router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    const { app } = req.body;
    if (!app || !isValidAppName(app.toLowerCase())) {
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
        const delRes = await fetch(`https://backend.composio.dev/api/v1/connectedAccounts/${account.id}`, {
          method: 'DELETE',
          headers: { 'x-api-key': COMPOSIO_API_KEY },
        });
        if (!delRes.ok) {
          logger.error({ status: delRes.status }, `Composio DELETE failed for account ${account.id}`);
          return res.status(502).json({ error: { code: 'DISCONNECT_UPSTREAM_ERROR', message: 'Failed to disconnect app on Composio.' } });
        }
      }
    }
    await invalidateToolsCache(req.user.id);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, 'Disconnect error');
    res.status(500).json({ error: { code: 'DISCONNECT_ERROR', message: 'Failed to disconnect app.' } });
  }
});

// GET /connect/:app — generate OAuth link and redirect (Bearer auth)
router.get('/:app', requireAuth, async (req, res) => {
  try {
    const app = req.params.app.toLowerCase();
    if (!isValidAppName(app)) {
      return res.status(400).json({ error: { code: 'INVALID_APP', message: 'Unsupported app.' } });
    }
    const state = await generateOAuthState(req.user.id, app);
    const redirectUrl = `${BASE_URL}/connect/callback?state=${state}`;
    const url = await getConnectionLink(req.user.id, app, redirectUrl);
    res.cookie(OAUTH_COOKIE_NAME, computeStateHmac(state), OAUTH_COOKIE_OPTS);
    res.redirect(url);
  } catch (err) {
    logger.error({ err: err.message }, 'Connection link error');
    res.status(500).json({ error: { code: 'CONNECTION_LINK_ERROR', message: 'Failed to generate connection link.' } });
  }
});

// DELETE /connect/:app — disconnect app (Bearer auth)
router.delete('/:app', requireAuth, async (req, res) => {
  try {
    const app = req.params.app.toLowerCase();
    if (!isValidAppName(app)) {
      return res.status(400).json({ error: { code: 'INVALID_APP', message: 'Unsupported app.' } });
    }
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
        const delRes = await fetch(`https://backend.composio.dev/api/v1/connectedAccounts/${account.id}`, {
          method: 'DELETE',
          headers: { 'x-api-key': COMPOSIO_API_KEY },
        });
        if (!delRes.ok) {
          logger.error({ status: delRes.status }, `Composio DELETE failed for account ${account.id}`);
          return res.status(502).json({ error: { code: 'DISCONNECT_UPSTREAM_ERROR', message: 'Failed to disconnect app on Composio.' } });
        }
      }
    }
    await invalidateToolsCache(req.user.id);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, 'Disconnect error');
    res.status(500).json({ error: { code: 'DISCONNECT_ERROR', message: 'Failed to disconnect app.' } });
  }
});

module.exports = router;
