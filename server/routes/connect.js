const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../services/logger');
const requireAuth = require('../middleware/requireAuth');
const { redis } = require('../services/redis');
const { getConnectionStatus, getConnectionLink, invalidateToolsCache, WINGMAN_APPS } = require('../services/composio');
const { fetchWithTimeout } = require('../lib/fetch-with-timeout');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const OTP_SECRET = process.env.OTP_SECRET; // Dedicated HMAC key — avoids reusing JWT_SECRET for non-JWT operations
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
const CONNECT_TOKEN_TTL = 300; // 5 minutes

// HMAC to bind OAuth callback to the browser that initiated the flow (IDOR fix)
function computeStateHmac(state) {
  return crypto.createHmac('sha256', OTP_SECRET).update(state).digest('hex');
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

// Lua script: atomically consume the OAuth nonce, invalidate the tools cache,
// AND set a short cooldown to prevent concurrent getTools() from re-populating
// stale data before Composio propagates the connection change.
// KEYS[1] = oauth_nonce:{nonce}, KEYS[2] = tools:{userId}, KEYS[3] = tools_cooldown:{userId}
// ARGV[1] = expected userId string, ARGV[2] = cooldown TTL in seconds
// Returns the stored userId if valid, nil otherwise.
const TOOLS_CACHE_COOLDOWN_TTL = 15; // must match composio.js TOOLS_CACHE_COOLDOWN_TTL
const VERIFY_AND_INVALIDATE_LUA = `
local storedUserId = redis.call('GETDEL', KEYS[1])
if not storedUserId then return nil end
if storedUserId ~= ARGV[1] then return nil end
redis.call('DEL', KEYS[2])
redis.call('SET', KEYS[3], '1', 'EX', ARGV[2])
return storedUserId
`;

// Verify and decode an OAuth state token, atomically consuming the nonce,
// invalidating the tools cache, and setting a cooldown in a single Redis round-trip.
// Returns null for invalid/expired JWT tokens.
// Throws on Redis errors so the caller can return 500 instead of a misleading 400.
async function verifyOAuthState(stateToken) {
  let payload;
  try {
    payload = jwt.verify(stateToken, JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null; // expired or malformed JWT — not a server error
  }
  if (!payload.nonce) return null;
  const nonceKey = `oauth_nonce:${payload.nonce}`;
  const cacheKey = `tools:${payload.userId}`;
  const cooldownKey = `tools_cooldown:${payload.userId}`;
  const expectedUserId = String(payload.userId);
  // Single atomic Redis operation: consume nonce + invalidate tools cache + set cooldown
  // Redis errors intentionally propagate — caller handles with 500
  const storedUserId = await redis.eval(
    VERIFY_AND_INVALIDATE_LUA, 3, nonceKey, cacheKey, cooldownKey,
    expectedUserId, String(TOOLS_CACHE_COOLDOWN_TTL)
  );
  if (!storedUserId) return null;
  return payload;
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

// GET /connect/initiate — initiate OAuth with single-use connect token (Bearer auth + userId match)
router.get('/initiate', requireAuth, async (req, res) => {
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
    // Verify the authenticated user matches the token's userId to prevent IDOR
    if (String(userId) !== String(req.user.id)) {
      logger.warn({ tokenUserId: userId, authUserId: req.user.id }, '[connect] initiate userId mismatch');
      return res.status(403).json({ error: { code: 'USER_MISMATCH', message: 'Connect token does not belong to the authenticated user.' } });
    }
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
    const cookieBuf = cookieHmac ? Buffer.from(cookieHmac, 'utf8') : null;
    const expectedBuf = Buffer.from(expectedHmac, 'utf8');
    if (!cookieBuf || cookieBuf.length !== expectedBuf.length ||
        !crypto.timingSafeEqual(cookieBuf, expectedBuf)) {
      return res.status(403).json({ error: { code: 'OAUTH_SESSION_MISMATCH', message: 'OAuth session mismatch. Please retry the connection from your app.' } });
    }
    res.clearCookie(OAUTH_COOKIE_NAME, { path: '/connect/callback' });

    // verifyOAuthState atomically consumes the nonce, invalidates the tools
    // cache, AND sets a cooldown (preventing stale re-population) in a single
    // Lua script. JWT errors → null (invalid token), Redis errors → throw.
    let payload;
    try {
      payload = await verifyOAuthState(state);
    } catch (err) {
      // Redis failure during atomic verify — nonce may or may not be consumed.
      // Return 500 (not 400) so the user knows to retry.
      logger.error({ err: err.message }, '[connect] Redis error during OAuth state verification');
      return res.status(500).json({ error: { code: 'OAUTH_CALLBACK_ERROR', message: 'Something went wrong. Please retry the connection.' } });
    }
    if (!payload) {
      return res.status(400).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'Invalid or expired OAuth state token.' } });
    }
    const { userId, app: appName } = payload;
    const sanitizedApp = (typeof appName === 'string' && isValidAppName(appName.toLowerCase()))
      ? appName.toLowerCase()
      : '';

    // Verify with Composio that the OAuth flow actually completed successfully.
    // Without this, an attacker could craft a direct request to the callback URL
    // with a valid state token without completing OAuth on the provider side.
    if (sanitizedApp) {
      const status = await getConnectionStatus(userId, [sanitizedApp]);
      if (!status.connected || !status.connected.includes(sanitizedApp)) {
        logger.warn({ userId, app: sanitizedApp }, '[connect] OAuth callback received but app not connected on Composio');
        return res.status(400).json({ error: { code: 'OAUTH_NOT_COMPLETED', message: 'OAuth flow was not completed. Please retry the connection.' } });
      }
    }

    res.redirect(`${WEB_URL}/connect/success?app=${sanitizedApp}`);
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
    const listRes = await fetchWithTimeout(listUrl, { headers: { 'x-api-key': COMPOSIO_API_KEY }, timeoutMs: 10_000 });
    if (listRes.ok) {
      const data = await listRes.json();
      const account = (data.items || []).find(
        c => c.appName.toLowerCase() === app.toLowerCase() && c.status === 'ACTIVE'
      );
      if (account) {
        const delRes = await fetchWithTimeout(`https://backend.composio.dev/api/v1/connectedAccounts/${account.id}`, {
          method: 'DELETE',
          headers: { 'x-api-key': COMPOSIO_API_KEY },
          timeoutMs: 10_000,
        });
        if (!delRes.ok) {
          logger.error({ status: delRes.status }, `Composio DELETE failed for account ${account.id}`);
          return res.status(502).json({ error: { code: 'DISCONNECT_UPSTREAM_ERROR', message: 'Failed to disconnect app on Composio.' } });
        }
      }
    }
    // Best-effort cache invalidation — Composio DELETE already succeeded,
    // so don't fail the request if Redis is temporarily unavailable.
    // Cache will self-heal on TTL expiry (30 min) if this fails.
    await invalidateToolsCache(req.user.id).catch(err => {
      logger.warn({ err: err.message, userId: req.user.id }, '[connect] tools cache invalidation failed after disconnect (best-effort)');
    });
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
    const listRes = await fetchWithTimeout(listUrl, { headers: { 'x-api-key': COMPOSIO_API_KEY }, timeoutMs: 10_000 });
    if (listRes.ok) {
      const data = await listRes.json();
      const account = (data.items || []).find(
        c => c.appName.toLowerCase() === app && c.status === 'ACTIVE'
      );
      if (account) {
        const delRes = await fetchWithTimeout(`https://backend.composio.dev/api/v1/connectedAccounts/${account.id}`, {
          method: 'DELETE',
          headers: { 'x-api-key': COMPOSIO_API_KEY },
          timeoutMs: 10_000,
        });
        if (!delRes.ok) {
          logger.error({ status: delRes.status }, `Composio DELETE failed for account ${account.id}`);
          return res.status(502).json({ error: { code: 'DISCONNECT_UPSTREAM_ERROR', message: 'Failed to disconnect app on Composio.' } });
        }
      }
    }
    // Best-effort cache invalidation — Composio DELETE already succeeded
    await invalidateToolsCache(req.user.id).catch(err => {
      logger.warn({ err: err.message, userId: req.user.id }, '[connect] tools cache invalidation failed after disconnect (best-effort)');
    });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, 'Disconnect error');
    res.status(500).json({ error: { code: 'DISCONNECT_ERROR', message: 'Failed to disconnect app.' } });
  }
});

module.exports = router;
