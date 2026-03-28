const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../services/logger');
const requireAuth = require('../middleware/requireAuth');
const { redis } = require('../services/redis');
const { getConnectionStatus, getConnectionLink, invalidateToolsCache, WINGMAN_APPS } = require('../services/composio');
const { fetchWithTimeout } = require('../lib/fetch-with-timeout');

const router = express.Router();

const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET; // Dedicated secret for OAuth state token signing
const OTP_SECRET = process.env.OTP_SECRET; // Dedicated HMAC key — avoids reusing JWT_SECRET for non-JWT operations
const CONNECT_TOKEN_TTL = 300; // 5 minutes

// HMAC to bind OAuth callback to the browser that initiated the flow (IDOR fix)
function computeStateHmac(state) {
  return crypto.createHmac('sha256', OTP_SECRET).update(state).digest('hex');
}

const OAUTH_COOKIE_NAME = 'oauth_state_hmac';
const OAUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV !== 'development',
  maxAge: 10 * 60 * 1000, // 10 minutes, matches state JWT expiry
  path: '/connect/callback',
};

// Generate a signed, time-limited state token for OAuth callbacks.
// Includes a random nonce stored in Redis to tie the token to a server-side session (CSRF protection).
async function generateOAuthState(userId, app) {
  const nonce = crypto.randomBytes(32).toString('hex');
  // Store userId alongside nonce so callback can verify the state token wasn't forged for a different user
  await redis.set(`oauth_nonce:${nonce}`, String(userId), 'EX', 600); // 10-minute TTL matching JWT expiry
  return jwt.sign({ userId, app, nonce }, OAUTH_STATE_SECRET, { expiresIn: '10m' });
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
    payload = jwt.verify(stateToken, OAUTH_STATE_SECRET, { algorithms: ['HS256'] });
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

// HMAC signature that binds a connect token to a specific userId.
// Returned alongside the token so the /initiate route can verify userId ownership
// without requiring Bearer auth (since it's opened in a system browser).
function signConnectToken(connectToken, userId) {
  return crypto.createHmac('sha256', OTP_SECRET)
    .update(`connect:${connectToken}:${userId}`)
    .digest('hex');
}

// Derive a session fingerprint from the user's JWT so connect tokens are bound
// to the specific session that created them. An intercepted token is useless
// without the matching sessionBind value (which requires the original JWT).
function deriveSessionBind(authHeader) {
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
}

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
    // Bind token to the requesting session via SHA-256 fingerprint of the JWT
    const sessionBind = deriveSessionBind(req.headers.authorization);
    await redis.set(key, JSON.stringify({ userId: req.user.id, app: app.toLowerCase(), sessionBind }), 'EX', CONNECT_TOKEN_TTL);
    // Return HMAC sig so the browser-based /initiate route can verify userId binding
    // without Bearer auth (WebBrowser.openAuthSessionAsync can't send headers)
    const sig = signConnectToken(connectToken, req.user.id);
    res.json({ connectToken, sig, sessionBind });
  } catch (err) {
    logger.error({ err: err.message }, '[connect] create-connect-token error');
    res.status(500).json({ error: { code: 'CONNECT_TOKEN_ERROR', message: 'Failed to create connect token.' } });
  }
});

// GET /connect/initiate — initiate OAuth with single-use connect token + HMAC userId binding
// Note: no requireAuth — this route is opened in a system browser (WebBrowser.openAuthSessionAsync)
// which cannot send Bearer headers or app cookies. Security is enforced by:
//   1. 256-bit random connect token (computationally infeasible to guess)
//   2. Single-use via atomic GETDEL (prevents replay)
//   3. 5-minute TTL (limits exposure window)
//   4. HMAC sig binding token to userId (prevents IDOR — only the server can produce a valid sig)
router.get('/initiate', async (req, res) => {
  try {
    const { connectToken, sig, sessionBind } = req.query;
    if (!connectToken) {
      return res.status(400).json({ error: { code: 'MISSING_CONNECT_TOKEN', message: 'Missing connectToken parameter.' } });
    }
    if (!sig) {
      return res.status(400).json({ error: { code: 'MISSING_SIGNATURE', message: 'Missing sig parameter.' } });
    }
    if (!sessionBind) {
      return res.status(400).json({ error: { code: 'MISSING_SESSION_BIND', message: 'Missing sessionBind parameter.' } });
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
    const { userId, app, sessionBind: storedSessionBind } = parsed;
    // Verify the token is consumed by the same session that created it
    const bindBuf = Buffer.from(String(sessionBind), 'utf8');
    const storedBuf = Buffer.from(String(storedSessionBind), 'utf8');
    if (bindBuf.length !== storedBuf.length || !crypto.timingSafeEqual(bindBuf, storedBuf)) {
      logger.warn({ userId }, '[connect] initiate sessionBind mismatch — token not bound to this session');
      return res.status(403).json({ error: { code: 'SESSION_BIND_MISMATCH', message: 'Connect token is not bound to this session.' } });
    }
    // Verify HMAC sig binds this token to the correct userId (IDOR prevention).
    // Only the server can produce a valid sig via signConnectToken(), so an attacker
    // who intercepts or guesses a connectToken cannot forge a sig for a different user.
    const expectedSig = signConnectToken(connectToken, userId);
    const sigBuf = Buffer.from(String(sig), 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      logger.warn({ userId }, '[connect] initiate HMAC signature mismatch');
      return res.status(403).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid connect token signature.' } });
    }
    const state = await generateOAuthState(userId, app);
    const url = await getConnectionLink(userId, app, state);
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

    res.redirect(`${WEB_URL}/connect/callback?app=${sanitizedApp}`);
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
    if (!listRes.ok) {
      logger.error({ status: listRes.status }, '[connect] Composio list connectedAccounts failed');
      return res.status(502).json({ error: { code: 'DISCONNECT_UPSTREAM_ERROR', message: 'Failed to disconnect app on Composio.' } });
    }
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
    const url = await getConnectionLink(req.user.id, app, state);
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
    if (!listRes.ok) {
      logger.error({ status: listRes.status }, '[connect] Composio list connectedAccounts failed');
      return res.status(502).json({ error: { code: 'DISCONNECT_UPSTREAM_ERROR', message: 'Failed to disconnect app on Composio.' } });
    }
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
