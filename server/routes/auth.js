const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const logger = require('../services/logger');
const { createRedisClient } = require('../services/redis');
const jwksClient = require('jwks-rsa');
const { OAuth2Client } = require('google-auth-library');
const { provider } = require('../services/messaging');
const { getUserByPhone, getUserByEmail, getUserByGoogleId, getUserByAppleId, getUserById, createUser, getOrCreateUserByPhone, createUserByEmail, updateUserPin, claimUserPin, linkUserIdentity, mergeUserAccounts, deleteUser, persistBlacklistEntry, checkBlacklistEntries, purgeExpiredBlacklistEntries } = require('../db/queries');
const { withTransaction } = require('../db/index');
const { fetchWithTimeout } = require('../lib/fetch-with-timeout');

// Synthetic phone prefixes — must match the list in db/queries.js
const SYNTHETIC_PREFIXES = ['email:', 'google:', 'apple:'];

/**
 * Reject identifiers that could produce nested or ambiguous synthetic keys.
 * E.g. an email of "google:attackerId" would create phone "email:google:attackerId".
 */
function assertCleanIdentifier(value, label) {
  if (!value || typeof value !== 'string') return;
  if (SYNTHETIC_PREFIXES.some(p => value.startsWith(p)) || /^\+[1-9]\d{1,14}$/.test(value)) {
    throw new Error(`${label} looks like a synthetic key or phone number`);
  }
}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const appleJwksClient = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000,
});

async function verifyAppleToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid Apple token format.');
  }
  let header;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  } catch {
    throw new Error('Apple token has malformed header.');
  }
  if (!header.kid) {
    throw new Error('Apple token missing kid in header.');
  }
  const signingKey = await appleJwksClient.getSigningKey(header.kid);
  const verifyOptions = {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
  };
  if (!process.env.APPLE_CLIENT_ID) {
    throw new Error('APPLE_CLIENT_ID environment variable is required for Apple token verification');
  }
  verifyOptions.audience = process.env.APPLE_CLIENT_ID;
  return jwt.verify(token, signingKey.getPublicKey(), verifyOptions);
}

const router = express.Router();
// Lazy require to avoid circular dependency (requireAuth imports verifyToken from this file)
let _requireAuth;
function requireAuth(req, res, next) {
  if (!_requireAuth) _requireAuth = require('../middleware/requireAuth');
  return _requireAuth(req, res, next);
}
const redis = createRedisClient();
// ---------------------------------------------------------------------------
// JWT Key Rotation Support
// ---------------------------------------------------------------------------
// JWT_SECRETS (optional): JSON array of {kid, secret} objects for key rotation.
//   The FIRST entry is the current signing key; older keys verify existing tokens.
//   Example: JWT_SECRETS='[{"kid":"v2","secret":"<64+ chars>"},{"kid":"v1","secret":"<old 64+ chars>"}]'
//
// JWT_SECRET (required fallback): Single key used when JWT_SECRETS is not set.
//   Automatically assigned kid "default".
// ---------------------------------------------------------------------------
let jwtKeyring = []; // [{kid, secret}] — first entry = signing key

if (process.env.JWT_SECRETS) {
  try {
    const parsed = JSON.parse(process.env.JWT_SECRETS);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.error('FATAL: JWT_SECRETS must be a non-empty JSON array of {kid, secret} objects');
      process.exit(1);
    }
    for (const entry of parsed) {
      if (!entry.kid || typeof entry.kid !== 'string') {
        console.error('FATAL: Each JWT_SECRETS entry must have a string "kid" field');
        process.exit(1);
      }
      if (!entry.secret || typeof entry.secret !== 'string' || entry.secret.length < 64) {
        console.error(`FATAL: JWT_SECRETS entry "${entry.kid}" must have a "secret" of at least 64 characters`);
        process.exit(1);
      }
    }
    // Check for duplicate kids
    const kids = parsed.map((e) => e.kid);
    if (new Set(kids).size !== kids.length) {
      console.error('FATAL: JWT_SECRETS contains duplicate "kid" values');
      process.exit(1);
    }
    jwtKeyring = parsed;
    logger.info({ kids }, '[auth] JWT keyring loaded with %d key(s)', parsed.length);
  } catch (err) {
    if (err.name === 'SyntaxError') {
      console.error('FATAL: JWT_SECRETS is not valid JSON');
      process.exit(1);
    }
    throw err;
  }
} else {
  // Fallback to single JWT_SECRET
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is required');
    process.exit(1);
  }
  if (JWT_SECRET.length < 64) {
    console.error('FATAL: JWT_SECRET must be at least 64 characters long to prevent brute-force token forgery');
    process.exit(1);
  }
  jwtKeyring = [{ kid: 'default', secret: JWT_SECRET }];
}

/** Current signing key (first in keyring). */
const jwtSigningKey = jwtKeyring[0];
const OTP_SECRET = process.env.OTP_SECRET;
if (!OTP_SECRET) {
  console.error('FATAL: OTP_SECRET environment variable is required (must differ from JWT_SECRET)');
  process.exit(1);
}
if (OTP_SECRET.length < 32) {
  console.error('FATAL: OTP_SECRET must be at least 32 characters long');
  process.exit(1);
}
const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET;
if (!OAUTH_STATE_SECRET) {
  console.error('FATAL: OAUTH_STATE_SECRET environment variable is required (must differ from JWT_SECRET)');
  process.exit(1);
}
if (OAUTH_STATE_SECRET.length < 32) {
  console.error('FATAL: OAUTH_STATE_SECRET must be at least 32 characters long');
  process.exit(1);
}
const JWT_ISSUER = 'wingman';
const JWT_AUDIENCE = 'wingman-app';
const OTP_TTL = 600; // 10 minutes
const AUTH_CODE_TTL = 60; // 60 seconds — short-lived, single-use
const AUTH_COOKIE_NAME = '__wingman_sess';
// Pre-computed bcrypt hash used as a timing equalizer when the account does not
// exist.  bcrypt.compare against this dummy always returns false but takes the
// same wall-clock time as a real comparison, preventing timing-oracle enumeration.
const DUMMY_HASH = bcrypt.hashSync('wingman-dummy-sentinel', 10);

/** Set the httpOnly auth cookie for web clients. */
function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== 'false',
    sameSite: 'lax',
    maxAge: (86400 + REFRESH_GRACE_SECONDS) * 1000, // JWT expiry + refresh grace window
    path: '/',
  });
}

/**
 * Build the auth response body.
 *
 * The token is always included so that both native (SecureStore) and web
 * (in-memory) clients can store it for Bearer-header auth.  The httpOnly
 * cookie set by setAuthCookie() provides a fallback for web clients whose
 * in-memory token is lost (e.g. page reload during dev).
 *
 * Previously, web clients (detected via Origin header) received no token,
 * relying exclusively on the httpOnly cookie.  This broke cross-origin
 * setups (Expo web on :8081 → API on :3001) because the axios client did
 * not send credentials, so the cookie was silently discarded by the browser.
 * Returning the token in the body is equally secure: the web client keeps
 * it in a module-scoped variable (never localStorage), matching the XSS
 * resistance of an httpOnly cookie.
 */
function authResponse(_req, token, user) {
  const safeUser = { ...user, name: user.name || '' };
  return { success: true, user: safeUser, token };
}

/** Clear the httpOnly auth cookie (logout). */
function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== 'false',
    sameSite: 'lax',
    path: '/',
  });
}

// Rate limit login attempts: 10 per 15 minutes per IP (brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts, please try again later.' } },
});

// Rate limit signup attempts: 5 per 15 minutes per IP (abuse protection)
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many sign-up attempts, please try again later.' } },
});

// Rate limit OTP requests: 5 per 15 minutes per IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many OTP requests, please try again later.' } },
});

// Rate limit OTP verification: 5 attempts per 15 minutes per phone
// Never fall back to req.ip — it can be spoofed via X-Forwarded-For
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.body?.phone,
  skip: (req) => !req.body?.phone,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts. Try again in 15 minutes.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Global IP-based rate limit for OTP verification to prevent distributed
// brute-force across many phone numbers. An attacker spraying 1 guess per
// phone across thousands of numbers is capped to 10 total attempts per IP
// per 15-minute window.
const otpVerifyGlobalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many OTP verification attempts. Try again later.' } },
});

// Rate limit auth code exchange: 10 per 15 minutes per IP (defense in depth)
const exchangeCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many code exchange attempts, please try again later.' } },
});

// Rate limit social/Google auth: 10 per 15 minutes per IP (prevents token probing & resource exhaustion)
const socialAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many authentication attempts, please try again later.' } },
});

// Rate limit token refresh: 30 per 15 minutes per IP (allows burst from multiple
// in-flight requests while preventing abuse of the grace-window refresh flow)
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many refresh attempts, please try again later.' } },
});

function isValidPhone(phone) {
  return typeof phone === 'string' && /^\+[1-9]\d{1,14}$/.test(phone);
}

async function signToken(payload, expiresInSeconds = 86400) {
  if (payload.userId) {
    const deleted = await redis.get(`user_deleted:${payload.userId}`);
    if (deleted === '1') {
      const err = new Error('Account has been deleted.');
      err.code = 'USER_DELETED';
      throw err;
    }
  }
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, jwtSigningKey.secret, {
    algorithm: 'HS256',
    expiresIn: expiresInSeconds,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    keyid: jwtSigningKey.kid,
  });
}

function verifyToken(token, opts = {}) {
  const verifyOpts = {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    ...opts,
  };

  // Try to match by kid from the token header first (O(1) lookup)
  try {
    const header = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString()
    );
    if (header.kid) {
      const entry = jwtKeyring.find((k) => k.kid === header.kid);
      if (entry) {
        return jwt.verify(token, entry.secret, verifyOpts);
      }
    }
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      console.warn('[auth] JWT expired (kid lookup):', err.expiredAt);
      return null;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      console.warn('[auth] JWT verification failed (kid lookup):', err.message);
      return null;
    }
    console.error('[auth] Unexpected error during JWT kid lookup:', err);
    // Fall through to brute-force attempt below
  }

  // Legacy tokens without kid, or kid not found — try all keys
  let lastErr = null;
  for (const entry of jwtKeyring) {
    try {
      return jwt.verify(token, entry.secret, verifyOpts);
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) {
    if (lastErr instanceof jwt.TokenExpiredError) {
      console.warn('[auth] JWT expired:', lastErr.expiredAt);
    } else if (lastErr instanceof jwt.JsonWebTokenError) {
      console.warn('[auth] JWT verification failed:', lastErr.message);
    } else {
      console.error('[auth] Unexpected error during JWT verification:', lastErr);
    }
  }
  return null;
}

async function findAndLinkUser({ phone, email, google_id, apple_id }) {
  let user = null;
  let foundBy = null; // Track which identity matched to restrict cross-provider linking

  // 1. Lookup by provider-specific ID first (strongest match)
  if (google_id) { user = await getUserByGoogleId(google_id); if (user) foundBy = 'google_id'; }
  if (!user && apple_id) { user = await getUserByAppleId(apple_id); if (user) foundBy = 'apple_id'; }
  if (!user && email) { user = await getUserByEmail(email); if (user) foundBy = 'email'; }
  if (!user && phone) { user = await getUserByPhone(phone); if (user) foundBy = 'phone'; }

  // 2. Synthetic phone fallback: only match same-provider synthetic keys.
  //    e.g. google_id lookup → google:<id> synthetic phone only.
  //    This prevents cross-provider account discovery via synthetic keys.
  if (!user && google_id) { user = await getUserByPhone(`google:${google_id}`); if (user) foundBy = 'google_id'; }
  if (!user && apple_id) { user = await getUserByPhone(`apple:${apple_id}`); if (user) foundBy = 'apple_id'; }
  if (!user && email) { user = await getUserByPhone(`email:${email}`); if (user) foundBy = 'email'; }

  if (!user) return null;

  // Only fill in identity fields that are currently empty on the found user.
  // Never overwrite an existing identity — that would allow an attacker who
  // controls one provider to hijack an identity on another provider.
  //
  // SECURITY: Restrict cross-provider auto-linking to prevent account takeover.
  // A google_id is only linked if the user was found by google_id (already owned)
  // or by the email provided in the same OAuth flow (Google/Apple verify email
  // ownership). Never auto-link a provider ID when the user was found by a
  // *different* provider ID or by phone alone.
  const updates = {};

  // Email can be linked if the provider that found the user verified it
  // (Google/Apple OAuth verify email ownership), or if found by email itself.
  if (email && !user.email) {
    if (['google_id', 'apple_id', 'email'].includes(foundBy)) {
      updates.email = email;
    }
  }

  // google_id: only link if user was found by their own google_id (re-login)
  // or by the verified email from the same Google OAuth flow.
  // Never link if user was found by apple_id or phone — that's cross-provider.
  if (google_id && !user.google_id) {
    if (foundBy === 'google_id' || foundBy === 'email') {
      updates.google_id = google_id;
    }
  }

  // apple_id: same logic as google_id
  if (apple_id && !user.apple_id) {
    if (foundBy === 'apple_id' || foundBy === 'email') {
      updates.apple_id = apple_id;
    }
  }

  // Phone: only replace synthetic phone placeholders, never a real phone number.
  if (phone && isValidPhone(phone) && user.phone !== phone) {
    if (!user.phone || user.phone.startsWith('email:') || user.phone.startsWith('google:') || user.phone.startsWith('apple:')) {
      updates.phone = phone;
    }
  }

  if (Object.keys(updates).length > 0) {
    // linkUserIdentity performs its own conflict check and will return null
    // if any identity is already claimed by another user or if it would
    // overwrite a non-null field with a different value.
    const linked = await linkUserIdentity(user.id, updates);
    if (linked) {
      // Session fixation prevention: invalidate all existing sessions when
      // identity fields change, forcing re-authentication with the new state.
      await invalidateUserSessions(user.id);
      user = linked;
    }
    // If linking failed (conflict), we still return the original user —
    // the caller gets a valid session but no cross-account linking occurs.
  }

  return user;
}

// POST /auth/signup — email/password registration
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Email and password are required.' } });
    }
    if (typeof email !== 'string' || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(email)) {
      return res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'Invalid email format.' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: { code: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 8 characters.' } });
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: { code: 'PASSWORD_TOO_WEAK', message: 'Password must include uppercase, lowercase, digit, and special character.' } });
    }

    const normalizedEmail = email.toLowerCase();
    assertCleanIdentifier(normalizedEmail, 'email');
    let user = await findAndLinkUser({ email: normalizedEmail });
    if (user && user.pin_hash) {
      return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    if (user) {
      // Atomically set pin only if no pin exists yet — prevents race where
      // another request sets a pin between our check and this update.
      const claimed = await claimUserPin(user.id, passwordHash);
      if (!claimed) {
        return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
      }
      try {
        const linked = await linkUserIdentity(user.id, { email: normalizedEmail });
        user = linked || claimed;
      } catch (linkErr) {
        if (linkErr.code === '23505') {
          return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
        }
        throw linkErr;
      }
    } else {
      // Atomically insert with email set to prevent concurrent-signup race.
      // createUserByEmail catches unique constraint violations and returns
      // the existing row if another request won the race.
      const { user: newUser, created } = await createUserByEmail(normalizedEmail, email.split('@')[0]);
      user = newUser;
      if (!created && user.pin_hash) {
        return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
      }
      if (created) {
        // Use atomic claimUserPin (not updateUserPin) so a concurrent loser's
        // claimUserPin can't slip in between our insert and PIN write, then get
        // unconditionally overwritten by updateUserPin.
        const claimed = await claimUserPin(user.id, passwordHash);
        if (!claimed) {
          return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
        }
      } else {
        // Race: another request created this user between our lookup and insert.
        // Use atomic claim to prevent overwriting a pin set by the winner.
        const claimed = await claimUserPin(user.id, passwordHash);
        if (!claimed) {
          return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
        }
        user = claimed;
      }
    }

    const token = await signToken({ userId: user.id, phone: user.phone });
    setAuthCookie(res, token);
    res.json(authResponse(req, token, { id: user.id, name: user.name }));
  } catch (err) {
    if (err.code === 'USER_DELETED') return res.status(403).json({ error: { code: 'USER_DELETED', message: 'Account has been deleted.' } });
    logger.error({ err: err.message }, 'Signup error');
    res.status(500).json({ error: { code: 'SIGNUP_ERROR', message: 'Sign-up failed. Please try again.' } });
  }
});

// POST /auth/login — email/password login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Email and password are required.' } });
    }

    const normalizedEmail = email.toLowerCase();

    // Escalating lockout for login (prevents brute-forcing PINs across windows)
    const loginLockoutKey = `login_lockout:${normalizedEmail}`;
    const loginCumulativeKey = `login_cumulative_fails:${normalizedEmail}`;

    const loginLockoutTTL = await redis.ttl(loginLockoutKey);
    if (loginLockoutTTL > 0) {
      const retryMin = Math.ceil(loginLockoutTTL / 60);
      return res.status(429).json({ error: { code: 'ACCOUNT_LOCKED', message: `Account temporarily locked due to too many failed attempts. Try again in ${retryMin} minute(s).` } });
    }

    // Per-window rate limiting (prevents distributed brute-force)
    const attemptKey = `login_attempts:${normalizedEmail}`;
    const attempts = parseInt(await redis.get(attemptKey) || '0', 10);
    if (attempts >= 5) {
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many failed login attempts for this account. Try again in 15 minutes.' } });
    }

    // Run both lookups in parallel to eliminate timing differences that could
    // leak whether an email exists under a specific storage strategy.
    const [emailUser, phoneUser] = await Promise.all([
      getUserByEmail(normalizedEmail),
      getUserByPhone(`email:${normalizedEmail}`),
    ]);
    let user = emailUser || phoneUser;

    // Always run bcrypt so response time is identical whether the account exists
    // or not — prevents timing-oracle account enumeration.
    const hashToCheck = (user && user.pin_hash) ? user.pin_hash : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCheck);

    if (!user || !user.pin_hash || !valid) {
      const failCount = await redis.incr(attemptKey);
      await redis.expire(attemptKey, 15 * 60);

      // Cumulative counter for escalating lockout (24h TTL)
      const cumulative = await redis.incr(loginCumulativeKey);
      if (cumulative === 1) await redis.expire(loginCumulativeKey, 24 * 60 * 60);

      let lockoutSeconds = 0;
      if (cumulative >= 20) lockoutSeconds = 24 * 60 * 60;
      else if (cumulative >= 15) lockoutSeconds = 4 * 60 * 60;
      else if (cumulative >= 10) lockoutSeconds = 60 * 60;

      if (lockoutSeconds > 0) {
        await redis.set(loginLockoutKey, '1', 'EX', lockoutSeconds);
      }

      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    }

    // Clear all counters on success
    await redis.del(attemptKey);
    await redis.del(loginCumulativeKey);
    await redis.del(loginLockoutKey);
    if (!user.email) {
      try {
        const linked = await linkUserIdentity(user.id, { email: normalizedEmail });
        if (linked) user = linked;
      } catch (linkErr) {
        if (linkErr.code === '23505') {
          return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'This email is already linked to another account.' } });
        }
        throw linkErr;
      }
    }
    const token = await signToken({ userId: user.id, phone: user.phone });
    setAuthCookie(res, token);
    res.json(authResponse(req, token, { id: user.id, name: user.name }));
  } catch (err) {
    if (err.code === 'USER_DELETED') return res.status(403).json({ error: { code: 'USER_DELETED', message: 'Account has been deleted.' } });
    logger.error({ err: err.message }, 'Login error');
    res.status(500).json({ error: { code: 'LOGIN_ERROR', message: 'Login failed. Please try again.' } });
  }
});

// Rate limit password reset requests: 3 per 15 minutes per IP
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many password reset requests, please try again later.' } },
});

const PASSWORD_RESET_TTL = 900; // 15 minutes

// POST /auth/request-password-reset — send a reset token to user's email
router.post('/request-password-reset', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Email is required.' } });
    }
    const normalizedEmail = email.toLowerCase();

    // Per-email rate limiting in Redis (prevents distributed reset-spam)
    const emailKey = `pw_reset_attempts:${normalizedEmail}`;
    const attempts = await redis.incr(emailKey);
    if (attempts === 1) await redis.expire(emailKey, PASSWORD_RESET_TTL);
    if (attempts > 3) {
      // Still return 200 to avoid email enumeration
      return res.json({ success: true, message: 'If an account with that email exists, a reset code has been sent.' });
    }

    const user = await getUserByEmail(normalizedEmail);

    // Always return success to prevent email enumeration
    if (!user || !user.pin_hash) {
      return res.json({ success: true, message: 'If an account with that email exists, a reset code has been sent.' });
    }

    // Generate a 6-digit reset code (same pattern as OTP)
    const resetCode = String(crypto.randomInt(100000, 999999));
    const resetHash = crypto.createHmac('sha256', OTP_SECRET).update(resetCode).digest('hex');
    const redisKey = `pw_reset:${normalizedEmail}`;
    await redis.set(redisKey, JSON.stringify({ hash: resetHash }), 'EX', PASSWORD_RESET_TTL);

    // Send via messaging provider (stub mode logs to console)
    if (user.phone && !user.phone.startsWith('email:') && !user.phone.startsWith('google:') && !user.phone.startsWith('apple:')) {
      try {
        await provider.send(user.phone, `Your Wingman password reset code is: ${resetCode}. It expires in 15 minutes.`);
      } catch (sendErr) {
        logger.error({ err: sendErr.message }, 'Failed to send password reset code via SMS');
      }
    }

    // In stub/dev mode, log redacted confirmation (code is retrievable via verify flow)
    if (process.env.MESSAGING_PROVIDER === 'stub' || !process.env.MESSAGING_PROVIDER) {
      logger.info(`[PASSWORD RESET] Reset code sent for ${normalizedEmail} (redacted from logs)`);
    }

    res.json({ success: true, message: 'If an account with that email exists, a reset code has been sent.' });
  } catch (err) {
    logger.error({ err: err.message }, 'Password reset request error');
    res.status(500).json({ error: { code: 'RESET_ERROR', message: 'Password reset request failed. Please try again.' } });
  }
});

// POST /auth/reset-password — verify reset code and set new password
router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Email, code, and new password are required.' } });
    }
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: { code: 'INVALID_CODE', message: 'Reset code must be 6 digits.' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: { code: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 8 characters.' } });
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: { code: 'PASSWORD_TOO_WEAK', message: 'Password must include uppercase, lowercase, digit, and special character.' } });
    }

    const normalizedEmail = email.toLowerCase();

    // Rate limit verification attempts per email
    const attemptKey = `pw_reset_verify:${normalizedEmail}`;
    const verifyAttempts = await redis.incr(attemptKey);
    if (verifyAttempts === 1) await redis.expire(attemptKey, PASSWORD_RESET_TTL);
    if (verifyAttempts > 5) {
      // Burn the token after too many failed attempts
      await redis.del(`pw_reset:${normalizedEmail}`);
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many failed attempts. Please request a new reset code.' } });
    }

    const redisKey = `pw_reset:${normalizedEmail}`;
    // Atomically retrieve AND delete the reset token (single-use)
    const storedRaw = await redis.call('GETDEL', redisKey);
    if (!storedRaw) {
      return res.status(400).json({ error: { code: 'INVALID_OR_EXPIRED', message: 'Reset code is invalid or has expired.' } });
    }

    let storedHash;
    try {
      storedHash = JSON.parse(storedRaw).hash;
    } catch {
      return res.status(400).json({ error: { code: 'INVALID_OR_EXPIRED', message: 'Reset code is invalid or has expired.' } });
    }

    const codeHash = crypto.createHmac('sha256', OTP_SECRET).update(code).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(codeHash, 'hex'), Buffer.from(storedHash, 'hex'))) {
      return res.status(400).json({ error: { code: 'INVALID_CODE', message: 'Incorrect reset code.' } });
    }

    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(400).json({ error: { code: 'INVALID_OR_EXPIRED', message: 'Reset code is invalid or has expired.' } });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await updateUserPin(user.id, passwordHash);

    // Clear verification attempt counters
    await redis.del(attemptKey);

    res.json({ success: true, message: 'Password has been reset successfully. Please sign in with your new password.' });
  } catch (err) {
    logger.error({ err: err.message }, 'Password reset error');
    res.status(500).json({ error: { code: 'RESET_ERROR', message: 'Password reset failed. Please try again.' } });
  }
});

// POST /auth/request-otp
router.post('/request-otp', otpLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: { code: 'PHONE_REQUIRED', message: 'Phone number is required.' } });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: { code: 'INVALID_PHONE', message: 'Invalid phone number format. Use E.164 (e.g. +15551234567).' } });
    }

    // Per-phone throttling: 60-second cooldown between OTP requests
    // Use SET NX EX atomically to prevent race conditions between check and set
    const cooldownKey = `otp_cooldown:${phone}`;
    const cooldownSet = await redis.set(cooldownKey, '1', 'EX', 60, 'NX');
    if (!cooldownSet) {
      return res.status(429).json({ error: { code: 'OTP_COOLDOWN', message: 'Please wait before requesting another code.' } });
    }

    // Per-phone daily quota: max 5 OTP requests per phone per 24 hours
    const quotaKey = `otp_daily:${phone}`;
    const dailyCount = parseInt(await redis.get(quotaKey) || '0', 10);
    if (dailyCount >= 5) {
      return res.status(429).json({ error: { code: 'OTP_QUOTA_EXCEEDED', message: 'Too many codes requested for this number today. Try again tomorrow.' } });
    }

    // If caller is already authenticated, record who requested the OTP so that
    // verify-otp can enforce that only the same user may link this phone number.
    let requestingUserId = null;
    let reqToken = null;
    const reqAuthHeader = req.headers.authorization;
    if (reqAuthHeader && reqAuthHeader.startsWith('Bearer ')) {
      reqToken = reqAuthHeader.slice(7);
    } else if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
      reqToken = req.cookies[AUTH_COOKIE_NAME];
    }
    if (reqToken) {
      const payload = verifyToken(reqToken);
      if (payload && payload.userId && !(await isTokenRevoked(payload.jti, payload.userId, payload.iat))) {
        requestingUserId = payload.userId;
      }
    }

    // If the caller is authenticated, only allow OTP requests for phones already
    // linked to their own account (re-verification). Block ALL other cases:
    // - Phone belongs to a different account → obvious hijack attempt
    // - Phone is unclaimed (not in DB) → session-fixation attack: attacker stores
    //   their userId as otp_requester, intercepts OTP (SIM-swap/SS7), then
    //   verify-otp's session-fixation guard passes because requester === caller,
    //   linking the victim's phone to the attacker's account and triggering
    //   mergeUserAccounts() if the victim later registers with that phone.
    // Authenticated users who need to add a NEW phone should sign out first and
    // go through the unauthenticated OTP flow, which creates/links without merge risk.
    if (requestingUserId) {
      const existingPhoneUser = await getUserByPhone(phone);
      if (!existingPhoneUser || String(existingPhoneUser.id) !== String(requestingUserId)) {
        return res.status(403).json({
          error: {
            code: 'PHONE_NOT_YOURS',
            message: 'You can only request an OTP for the phone number linked to your account.',
          },
        });
      }
    }
    const otp = crypto.randomInt(100000, 1000000).toString();
    // Store HMAC hash instead of plaintext — prevents Redis read access from leaking OTPs
    const otpHash = crypto.createHmac('sha256', OTP_SECRET).update(otp).digest('hex');
    // Generate a cryptographic nonce that binds the OTP to the requesting client.
    // Returned in the HTTP response and required at verify-otp time, so an attacker
    // who intercepts the OTP (SIM-swap/SS7) still can't verify without this nonce.
    const otpRequestId = crypto.randomUUID();
    // Bundle the requester ID and request nonce with the OTP hash so all three are
    // consumed atomically in a single GETDEL during verify-otp. This prevents
    // session-fixation races where separate keys could be independently consumed.
    const otpValue = JSON.stringify({ hash: otpHash, requester: requestingUserId ? String(requestingUserId) : null, requestId: otpRequestId });
    await redis.set(`otp:${phone}`, otpValue, 'EX', OTP_TTL);

    // Cooldown already set atomically above via SET NX EX
    // Increment daily quota counter (24-hour TTL set on first request)
    await redis.incr(quotaKey);
    if (dailyCount === 0) {
      await redis.expire(quotaKey, 86400);
    }
    await provider.sendMessage(phone, `Your Wingman verification code is: ${otp}. It expires in 10 minutes.`);

    res.json({ success: true, message: 'OTP sent.', otp_request_id: otpRequestId });
  } catch (err) {
    logger.error({ err: err.message }, 'OTP request error');
    res.status(500).json({ error: { code: 'OTP_SEND_ERROR', message: 'Failed to send OTP.' } });
  }
});

// POST /auth/verify-otp
router.post('/verify-otp', otpVerifyGlobalLimiter, otpVerifyLimiter, async (req, res) => {
  try {
    const { phone, code, otp_request_id } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Phone and code are required.' } });
    }
    if (!otp_request_id) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'otp_request_id is required. Use the value returned from request-otp.' } });
    }

    // Global Redis-based rate limit: cap total OTP verification attempts across
    // ALL phone numbers per IP. Prevents distributed enumeration where an attacker
    // sprays one guess per phone across thousands of numbers.
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const globalKey = `otp_verify_global:${ip}`;
    const globalAttempts = await redis.incr(globalKey);
    if (globalAttempts === 1) await redis.expire(globalKey, 15 * 60); // 15min window
    if (globalAttempts > 10) {
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many OTP verification attempts. Try again later.' } });
    }

    // System-wide rate limit: cap total OTP verification attempts across ALL IPs
    // and ALL phone numbers. Defends against distributed brute-force (botnet) where
    // an attacker uses many IPs × many phones to spray OTP guesses. With 1M possible
    // 6-digit OTPs, even 5 guesses/phone across 200K phones guarantees a hit — this
    // global cap prevents that volume from ever being reached.
    const systemWideKey = 'otp_verify_global_all';
    const systemWideAttempts = await redis.incr(systemWideKey);
    if (systemWideAttempts === 1) await redis.expire(systemWideKey, 15 * 60); // 15min window
    const systemWideMax = parseInt(process.env.OTP_GLOBAL_MAX, 10) || 100;
    if (systemWideAttempts > systemWideMax) {
      console.warn(`System-wide OTP verification rate limit reached: ${systemWideAttempts} attempts in window`);
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Service is experiencing high traffic. Please try again later.' } });
    }

    // Per-IP unique phone tracking: detect phone number enumeration from a single IP.
    // An attacker trying OTPs against many different phones from one IP is enumeration;
    // legitimate users verify 1-2 phones at most. Uses a Redis set of phones per IP.
    const ipPhonesKey = `otp_verify_phones:${ip}`;
    await redis.sadd(ipPhonesKey, phone);
    const uniquePhones = await redis.scard(ipPhonesKey);
    // Set TTL on first entry (won't reset on subsequent adds since key already exists)
    if (uniquePhones === 1) await redis.expire(ipPhonesKey, 15 * 60);
    if (uniquePhones > 3) {
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many different phone numbers attempted. Try again later.' } });
    }

    // Escalating lockout for OTP verification (prevents brute-forcing across windows)
    const otpLockoutKey = `otp_lockout:${phone}`;
    const otpLockoutTTL = await redis.ttl(otpLockoutKey);
    if (otpLockoutTTL > 0) {
      const retryMin = Math.ceil(otpLockoutTTL / 60);
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: `Account temporarily locked. Try again in ${retryMin} minute(s).` } });
    }

    // Redis-based per-phone rate limiting (prevents distributed brute-force across IPs)
    // Use atomic INCR to eliminate TOCTOU race where concurrent requests both read
    // the same count and bypass the limit. Increment first, check after.
    const attemptKey = `otp_attempts:${phone}`;
    const attempts = await redis.incr(attemptKey);
    // Set TTL only when the key is first created (count == 1) so the window is
    // fixed from the first failure, not reset on every attempt.
    if (attempts === 1) await redis.expire(attemptKey, OTP_TTL);

    // Cumulative counter tracks total failures across all windows (24h TTL).
    // This prevents the sliding-window bypass where an attacker waits for the
    // per-window counter to expire and gets fresh attempts indefinitely.
    const otpCumulativeKey = `otp_cumulative:${phone}`;
    const cumulative = await redis.incr(otpCumulativeKey);
    if (cumulative === 1) await redis.expire(otpCumulativeKey, 24 * 60 * 60);

    // Escalating lockout thresholds: 10 → 1h, 15 → 4h, 20+ → 24h
    let lockoutSeconds = 0;
    if (cumulative >= 20) lockoutSeconds = 24 * 60 * 60;
    else if (cumulative >= 15) lockoutSeconds = 4 * 60 * 60;
    else if (cumulative >= 10) lockoutSeconds = 60 * 60;

    if (lockoutSeconds > 0) {
      await redis.set(otpLockoutKey, '1', 'EX', lockoutSeconds);
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many failed OTP attempts. Account locked, try again later.' } });
    }

    if (attempts > 5) {
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many failed OTP attempts for this number. Try again in 10 minutes.' } });
    }

    const otpKey = `otp:${phone}`;
    // Atomically retrieve AND delete the OTP in one step to prevent race conditions
    // where concurrent requests both read the same OTP before either deletes it.
    const storedRaw = await redis.call('GETDEL', otpKey);
    let storedHash = null;
    let otpRequester = null;
    let storedRequestId = null;
    if (storedRaw) {
      try {
        const parsed = JSON.parse(storedRaw);
        storedHash = parsed.hash;
        otpRequester = parsed.requester;
        storedRequestId = parsed.requestId || null;
      } catch {
        // Legacy format (plain hash string) — no requester info available
        storedHash = storedRaw;
      }
    }
    const codeStr = String(code);
    // Compare HMAC of submitted code against stored hash (constant-time)
    const submittedHash = crypto.createHmac('sha256', OTP_SECRET).update(codeStr).digest('hex');
    if (!storedHash || storedHash.length !== submittedHash.length || !crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(submittedHash))) {
      // Attempt counter was already incremented atomically at the top of the handler,
      // so just return the error — no separate INCR needed here.
      return res.status(401).json({ error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP.' } });
    }

    // Request-binding guard: the otp_request_id nonce was generated at request-otp
    // time, returned to the client, and stored with the OTP. Every caller —
    // authenticated or not — must present the matching nonce. This closes the
    // session-fixation gap where an attacker who intercepts the OTP (SIM-swap/SS7)
    // but didn't initiate the request-otp HTTP call lacks the nonce.
    if (storedRequestId && otp_request_id !== storedRequestId) {
      // Restore the OTP so the legitimate requester (who has the correct nonce) can retry.
      if (storedRaw) {
        await redis.set(otpKey, storedRaw, 'EX', OTP_TTL);
      }
      return res.status(401).json({ error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP.' } });
    }

    // Distributed lock on the phone number to serialize all post-OTP operations
    // (attempt counter cleanup, user lookup/creation, account merge). Prevents
    // concurrent verify-otp requests for the same phone from racing between
    // GETDEL and account creation, which could cause duplicate accounts or
    // double-merge operations across multiple server instances.
    const lockKey = `otp_verify_lock:${phone}`;
    const lockValue = crypto.randomUUID();
    const lockTTL = 10; // seconds — generous ceiling for DB operations
    const acquired = await redis.set(lockKey, lockValue, 'EX', lockTTL, 'NX');
    if (!acquired) {
      // Another verify-otp request for this phone is already in the critical section.
      // The OTP was already consumed by GETDEL, so we can't retry — tell the client.
      return res.status(409).json({ error: { code: 'CONCURRENT_VERIFY', message: 'Verification already in progress for this number. Please try again.' } });
    }

    try {
    // OTP already consumed by GETDEL above — clear attempt counter and lockout state
    await redis.del(attemptKey);
    await redis.del(`otp_cumulative:${phone}`);
    await redis.del(`otp_lockout:${phone}`);

    // If the caller is already authenticated (e.g. signed up via email/Google),
    // link the phone to their existing account instead of creating a second one.
    // Check Bearer header first, then fall back to httpOnly cookie (web clients).
    let existingToken = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      existingToken = authHeader.slice(7);
    } else if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
      existingToken = req.cookies[AUTH_COOKIE_NAME];
    }
    let existingPayload = null;
    if (existingToken) {
      const ep = verifyToken(existingToken);
      if (ep && !(await isTokenRevoked(ep.jti, ep.userId, ep.iat))) {
        existingPayload = ep;
      }
    }

    // Session-fixation guard: if the caller is authenticated and wants to link
    // this phone, the OTP must have been requested by the SAME user. This prevents
    // an attacker (token A) from intercepting a victim's OTP to steal their phone.
    // The requester ID was bundled into the OTP value and consumed atomically above,
    // so there is no separate key that can be independently lost or raced.
    // Only enforce when otpRequester is set (i.e. the OTP was requested by an
    // authenticated user). When null, the OTP was requested unauthenticated — the
    // otp_request_id nonce already binds the OTP to the original HTTP caller,
    // preventing session-fixation even if the verifier is now authenticated.
    if (existingPayload && existingPayload.userId) {
      if (otpRequester && String(otpRequester) !== String(existingPayload.userId)) {
        // Restore the OTP so the legitimate user can still verify.
        // GETDEL already consumed it — put it back with full OTP_TTL so the
        // rightful requester isn't locked out by this mismatched attempt.
        if (storedRaw) {
          await redis.set(otpKey, storedRaw, 'EX', OTP_TTL);
        }
        return res.status(401).json({ error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP.' } });
      }
    }

    let user;
    let mergeWarnings = [];

    if (existingPayload && existingPayload.userId) {
      // Caller is already signed in — link phone to their account.
      // Use a transaction with SELECT ... FOR UPDATE to prevent concurrent
      // verify-otp requests from racing on the same merge operation.
      const txResult = await withTransaction(async (txQuery) => {
        // Advisory lock on the phone number to serialize all concurrent link
        // attempts for the same number. FOR UPDATE alone doesn't help when no
        // row with this phone exists yet — both transactions see zero rows and
        // proceed to UPDATE, causing a unique-constraint failure.
        await txQuery('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);

        // Lock both user rows to serialize concurrent merge attempts
        const authedRes = await txQuery('SELECT * FROM users WHERE id = $1 FOR UPDATE', [existingPayload.userId]);
        const authedUser = authedRes.rows[0] || null;
        const phoneRes = await txQuery('SELECT * FROM users WHERE phone = $1 FOR UPDATE', [phone]);
        const phoneUser = phoneRes.rows[0] || null;

        let mergeWarnings = [];
        if (phoneUser && authedUser && phoneUser.id !== authedUser.id) {
          // A separate phone-based account exists — merge it into the authenticated account
          const mergeResult = await mergeUserAccounts(authedUser.id, authedUser.id, phoneUser.id, txQuery);
          if (mergeResult && mergeResult.warnings) mergeWarnings = mergeResult.warnings;
        }

        if (authedUser) {
          // Set the real phone on the authenticated account
          const setClauses = ['phone = $1', 'updated_at = NOW()'];
          const setRes = await txQuery(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $2 RETURNING *`, [phone, authedUser.id]);
          return { user: setRes.rows[0], mergeWarnings };
        } else {
          // Auth token references a deleted user — fall through to normal flow
          if (phoneUser) return { user: phoneUser, mergeWarnings: [] };
          const { user: newUser } = await getOrCreateUserByPhone(phone, txQuery);
          return { user: newUser, mergeWarnings: [] };
        }
      });
      user = txResult.user;
      mergeWarnings = txResult.mergeWarnings;
    } else {
      // No existing session — normal phone-based login/signup.
      // Wrap in a transaction with the same advisory lock used by the authenticated
      // path so that user creation is serialized with account merges. Without this,
      // a concurrent authenticated request could check for phoneUser between our
      // INSERT and its merge decision, leaving an orphaned duplicate account.
      user = await withTransaction(async (txQuery) => {
        await txQuery('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);
        const result = await getOrCreateUserByPhone(phone, txQuery);
        return result.user;
      });
    }

    const token = await signToken({ userId: user.id, phone: user.phone });
    setAuthCookie(res, token);

    const response = authResponse(req, token, { id: user.id, phone: user.phone, name: user.name });
    if (mergeWarnings.length > 0) {
      logger.warn({ userId: user.id, warnings: mergeWarnings }, 'Account merge discarded source PIN');
      response.warnings = mergeWarnings;
    }
    res.json(response);
    } finally {
      // Release the distributed lock, but only if we still own it (compare-and-delete).
      // Uses a Lua script for atomicity — prevents releasing a lock that expired and
      // was re-acquired by another request.
      const releaseLua = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
      await redis.eval(releaseLua, 1, lockKey, lockValue).catch(err => { logger.error({ err: err.message }, '[auth] OTP lock release failed'); });
    }
  } catch (err) {
    // Unique-constraint on phone (code 23505) means another request linked
    // this number first. Return a clear 409 instead of a generic 500.
    if (err.code === 'USER_DELETED') return res.status(403).json({ error: { code: 'USER_DELETED', message: 'Account has been deleted.' } });
    if (err.code === '23505' && err.constraint && /phone/i.test(err.constraint)) {
      return res.status(409).json({ error: { code: 'PHONE_ALREADY_LINKED', message: 'This phone number was just linked to another account. Please try again.' } });
    }
    logger.error({ err: err.message }, 'OTP verify error');
    res.status(500).json({ error: { code: 'OTP_VERIFY_ERROR', message: 'Failed to verify OTP.' } });
  }
});

// Allowed redirect_uri full URLs for Google OAuth token exchange
// Validates exact URL (origin + path), not just origin, to prevent path manipulation.
const ALLOWED_REDIRECT_URIS = [
  process.env.GOOGLE_REDIRECT_URI,
  ...(process.env.NEXT_PUBLIC_APP_URL ? [`${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`] : []),
  // NOTE: CORS_ORIGIN is intentionally excluded — it controls cross-origin request policy,
  // not OAuth redirects. Deriving redirect URIs from it risks open-redirect if misconfigured.
  // Use GOOGLE_REDIRECT_URI or NEXT_PUBLIC_APP_URL for explicit redirect control.
  ...(process.env.NODE_ENV !== 'production' ? [
    'http://localhost:3000/auth/callback',
    'http://localhost:8081/auth/callback',
  ] : []),
].filter(Boolean);

function isAllowedRedirectUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  try {
    const parsed = new URL(uri);
    // Compare origin + pathname (strip trailing slash for consistency)
    const normalized = parsed.origin + parsed.pathname.replace(/\/+$/, '');
    return ALLOWED_REDIRECT_URIS.some(allowed => {
      const parsedAllowed = new URL(allowed);
      const normalizedAllowed = parsedAllowed.origin + parsedAllowed.pathname.replace(/\/+$/, '');
      return normalized === normalizedAllowed;
    });
  } catch {
    return false;
  }
}

// Helper: generate PKCE code_verifier and code_challenge (S256)
function generatePkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// POST /auth/google/init-state — issue a state token for SPA/mobile Google OAuth flow
// Client calls this before redirecting to Google, then sends state back with the code.
router.post('/google/init-state', socialAuthLimiter, async (req, res) => {
  try {
    const nonce = crypto.randomBytes(32).toString('hex');
    const jti = crypto.randomBytes(16).toString('hex');
    await redis.set(`oauth_nonce:${nonce}`, '1', 'EX', 300); // 5-minute TTL
    const state = jwt.sign({ nonce, flow: 'spa', jti }, OAUTH_STATE_SECRET, { expiresIn: '5m' });
    res.json({ state });
  } catch (err) {
    logger.error({ err: err.message }, 'Google init-state error');
    res.status(500).json({ error: { code: 'INIT_STATE_ERROR', message: 'Failed to generate OAuth state.' } });
  }
});

// POST /auth/google
router.post('/google', socialAuthLimiter, async (req, res) => {
  try {
    const { code, state, code_verifier } = req.body;
    if (!code) {
      return res.status(400).json({ error: { code: 'AUTH_CODE_REQUIRED', message: 'Authorization code is required.' } });
    }

    // Validate CSRF state token — required to prevent authorization code interception
    if (!state) {
      return res.status(400).json({ error: { code: 'MISSING_STATE', message: 'OAuth state parameter is required. Call POST /auth/google/init-state first.' } });
    }
    let statePayload;
    try {
      statePayload = jwt.verify(state, OAUTH_STATE_SECRET, { algorithms: ['HS256'] });
    } catch {
      return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'Invalid or expired OAuth state. Please restart the login flow.' } });
    }
    // Reject already-used state JWTs (blacklisted after first use)
    if (statePayload.jti) {
      const alreadyUsed = await redis.get(`oauth_state_used:${statePayload.jti}`);
      if (alreadyUsed) {
        return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state already used. Please restart the login flow.' } });
      }
    }
    // Verify and consume the nonce (single-use)
    const nonce = statePayload.nonce;
    if (!nonce) {
      return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state missing nonce.' } });
    }
    // Validate redirect_uri BEFORE consuming the nonce to prevent DoS via invalid redirect URIs
    const defaultRedirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback`;
    let finalRedirectUri;

    if (process.env.NODE_ENV === 'production') {
      // Production: ignore any client-supplied redirect_uri
      finalRedirectUri = process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri;
    } else {
      // Development: allow client override only if it passes the full-path allowlist check
      const clientUri = req.body.redirect_uri;
      if (clientUri) {
        if (!isAllowedRedirectUri(clientUri)) {
          return res.status(400).json({ error: { code: 'INVALID_REDIRECT_URI', message: 'Invalid redirect_uri.' } });
        }
        finalRedirectUri = clientUri;
      } else {
        finalRedirectUri = defaultRedirectUri;
      }
    }

    // Blacklist the state JWT itself so it cannot be replayed even while structurally valid
    if (statePayload.jti) {
      const ttl = statePayload.exp ? Math.max(statePayload.exp - Math.floor(Date.now() / 1000), 1) : 300;
      await redis.set(`oauth_state_used:${statePayload.jti}`, '1', 'EX', ttl);
    }
    const nonceKey = `oauth_nonce:${nonce}`;
    const nonceExists = await redis.call('GETDEL', nonceKey);
    if (!nonceExists) {
      return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state nonce expired or already used. Please restart the login flow.' } });
    }

    // Exchange the authorization code for tokens with Google
    // Include code_verifier for PKCE validation if the client used PKCE
    const tokenParams = {
      code: code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: finalRedirectUri,
      grant_type: 'authorization_code',
    };
    if (code_verifier) {
      tokenParams.code_verifier = code_verifier;
    }
    let tokenData;
    try {
      const tokenResponse = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenParams),
        timeoutMs: 10_000,
      });
      tokenData = await tokenResponse.json();
    } catch (fetchErr) {
      logger.error({ err: fetchErr.message }, 'Google token exchange network error');
      return res.status(502).json({ error: { code: 'GOOGLE_TOKEN_EXCHANGE_NETWORK_ERROR', message: 'Unable to reach Google for token exchange.' } });
    }

    if (!tokenData.access_token) {
      logger.error({ data: { error: tokenData.error, error_description: tokenData.error_description } }, 'Google token exchange failed');
      return res.status(401).json({ error: { code: 'TOKEN_EXCHANGE_FAILED', message: 'Failed to exchange authorization code.' } });
    }

    // Get user info from Google
    let googleUser;
    try {
      const userInfoResponse = await fetchWithTimeout('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        timeoutMs: 10_000,
      });
      googleUser = await userInfoResponse.json();
    } catch (fetchErr) {
      logger.error({ err: fetchErr.message }, 'Google userinfo fetch network error');
      return res.status(502).json({ error: { code: 'GOOGLE_USERINFO_NETWORK_ERROR', message: 'Unable to reach Google for user info.' } });
    }

    if (!googleUser.id || !googleUser.email) {
      return res.status(401).json({ error: { code: 'GOOGLE_USER_INFO_FAILED', message: 'Could not retrieve Google user info.' } });
    }

    const googleEmail = googleUser.email.toLowerCase();
    assertCleanIdentifier(googleEmail, 'email');
    assertCleanIdentifier(googleUser.id, 'google_id');
    let user = await findAndLinkUser({ email: googleEmail, google_id: googleUser.id });
    if (!user) {
      const googlePhone = `google:${googleUser.id}`;
      user = await createUser(googlePhone, googleUser.name || googleUser.email || 'User');
      try {
        const linked = await linkUserIdentity(user.id, { email: googleEmail, google_id: googleUser.id });
        if (linked) user = linked;
      } catch (linkErr) {
        if (linkErr.code === '23505') {
          return res.status(409).json({ error: { code: 'IDENTITY_CONFLICT', message: 'This email or Google account is already linked to another user.' } });
        }
        throw linkErr;
      }
    }

    const token = await signToken({ userId: user.id, phone: user.phone });
    setAuthCookie(res, token);
    res.json(authResponse(req, token, { id: user.id, name: user.name }));
  } catch (err) {
    if (err.code === 'USER_DELETED') return res.status(403).json({ error: { code: 'USER_DELETED', message: 'Account has been deleted.' } });
    logger.error({ err: err.message }, 'Google auth error');
    res.status(500).json({ error: { code: 'GOOGLE_AUTH_ERROR', message: 'Google sign-in failed.' } });
  }
});

// Allowed web origins for OAuth callback redirects (prevents open redirect)
const ALLOWED_WEB_ORIGINS = [
  'http://localhost:8098',
  'http://localhost:3000',
  'http://localhost:8081',
  'http://127.0.0.1:8098',
  // Include the configured CORS origin (typically the production HTTPS URL)
  ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
];

function isAllowedWebOrigin(origin) {
  return ALLOWED_WEB_ORIGINS.includes(origin) ||
    (process.env.CORS_ORIGIN && origin === process.env.CORS_ORIGIN);
}

// GET /auth/google — redirect to Google OAuth consent screen
router.get('/google', socialAuthLimiter, async (req, res, next) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: { code: 'GOOGLE_NOT_CONFIGURED', message: 'Google OAuth not configured.' } });
    }
    // Use server-configured redirect URI only — never accept from query params (open redirect risk)
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3001'}/auth/google/callback`;
    const scope = encodeURIComponent('openid email profile');
    // CSRF protection: generate a random nonce, store in Redis, and embed in JWT state.
    // On callback, the nonce is verified against Redis and deleted (single-use).
    const platform = req.query.platform === 'web' ? 'web' : 'native';
    const rawWebOrigin = req.query.webOrigin || '';
    // Validate webOrigin against allowlist at state-creation time (not just at redirect)
    const webOrigin = (rawWebOrigin && isAllowedWebOrigin(rawWebOrigin)) ? rawWebOrigin : '';
    // Client-generated CSRF token — echoed back in the redirect so the client can verify
    const clientState = typeof req.query.clientState === 'string' ? req.query.clientState : '';
    const nonce = crypto.randomBytes(32).toString('hex');
    const jti = crypto.randomBytes(16).toString('hex');
    await redis.set(`oauth_nonce:${nonce}`, '1', 'EX', 300); // 5-minute TTL

    // PKCE: generate code_verifier (stored server-side), send code_challenge to Google
    const pkce = generatePkce();
    await redis.set(`oauth_pkce:${nonce}`, pkce.verifier, 'EX', 300); // same TTL as nonce

    const state = jwt.sign({ platform, webOrigin, nonce, clientState, jti }, OAUTH_STATE_SECRET, { expiresIn: '5m' });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    res.redirect(url);
  } catch (err) {
    next(err);
  }
});

// Verify and parse signed OAuth state (JWT with 5-minute expiry)
function parseOAuthState(stateParam) {
  const fallback = { platform: 'native', webOrigin: '', clientState: '' };
  try {
    if (!stateParam) return fallback;
    const payload = jwt.verify(stateParam, OAUTH_STATE_SECRET, { algorithms: ['HS256'] });
    return {
      platform: payload.platform || 'native',
      webOrigin: payload.webOrigin || '',
      clientState: payload.clientState || '',
    };
  } catch (err) {
    console.warn('[oauth-state] Invalid or expired state token:', err.message);
    return fallback;
  }
}

function buildRedirectUrl(state, params) {
  const allParams = { ...params };
  // Echo the client-generated CSRF token so the mobile app can verify it
  if (state.clientState) allParams.clientState = state.clientState;
  const qs = new URLSearchParams(allParams).toString();
  if (state.platform === 'web' && state.webOrigin) {
    // webOrigin was already validated at state-creation time, but double-check
    if (isAllowedWebOrigin(state.webOrigin)) {
      return `${state.webOrigin}/connect/callback?${qs}`;
    }
  }
  return `wingman://connect/callback?${qs}`;
}

// GET /auth/google/callback — handle Google OAuth redirect
router.get('/google/callback', socialAuthLimiter, async (req, res) => {
  // Verify signed state token — reject if missing, expired, or tampered
  if (!req.query.state) {
    return res.status(400).json({ error: { code: 'MISSING_STATE', message: 'Missing OAuth state parameter.' } });
  }
  let statePayload;
  try {
    statePayload = jwt.verify(req.query.state, OAUTH_STATE_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'Invalid or expired OAuth state. Please restart the login flow.' } });
  }

  // Reject already-used state JWTs (blacklisted after first use)
  if (statePayload.jti) {
    const alreadyUsed = await redis.get(`oauth_state_used:${statePayload.jti}`);
    if (alreadyUsed) {
      return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state already used. Please restart the login flow.' } });
    }
  }

  // Verify the nonce exists in Redis (ties state to a server-side session) and consume it
  const nonce = statePayload.nonce;
  if (!nonce) {
    return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state missing nonce. Please restart the login flow.' } });
  }
  // Blacklist the state JWT so it cannot be replayed even while structurally valid
  if (statePayload.jti) {
    const ttl = statePayload.exp ? Math.max(statePayload.exp - Math.floor(Date.now() / 1000), 1) : 300;
    await redis.set(`oauth_state_used:${statePayload.jti}`, '1', 'EX', ttl);
  }
  const nonceKey = `oauth_nonce:${nonce}`;
  const nonceExists = await redis.call('GETDEL', nonceKey);
  if (!nonceExists) {
    return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state nonce expired or already used. Please restart the login flow.' } });
  }

  // Retrieve and consume PKCE code_verifier stored during GET /auth/google
  const pkceKey = `oauth_pkce:${nonce}`;
  const codeVerifier = await redis.call('GETDEL', pkceKey);
  if (!codeVerifier) {
    return res.status(440).json({ error: { code: 'SESSION_EXPIRED', message: 'OAuth session expired. Please restart the login flow.' } });
  }

  const state = parseOAuthState(req.query.state);

  try {
    const { code, error } = req.query;

    if (error) {
      logger.error({ err: error }, 'Google OAuth error');
      return res.redirect(buildRedirectUrl(state, { error }));
    }

    if (!code) {
      return res.redirect(buildRedirectUrl(state, { error: 'missing_code' }));
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      logger.error('Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
      return res.redirect(buildRedirectUrl(state, { error: 'server_config' }));
    }

    // Must match the redirect_uri used in the GET /auth/google consent redirect
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3001'}/auth/google/callback`;

    // Exchange auth code for tokens — include PKCE code_verifier for S256 challenge verification
    const tokenParams = {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    };
    if (codeVerifier) {
      tokenParams.code_verifier = codeVerifier;
    }
    let tokenData;
    try {
      const tokenResponse = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenParams),
        timeoutMs: 10_000,
      });
      tokenData = await tokenResponse.json();
    } catch (fetchErr) {
      logger.error({ err: fetchErr.message }, 'Google token exchange network error');
      return res.redirect(buildRedirectUrl(state, { error: 'token_exchange_network_error' }));
    }

    if (!tokenData.access_token) {
      logger.error({ data: { error: tokenData.error, error_description: tokenData.error_description } }, 'Google token exchange failed');
      return res.redirect(buildRedirectUrl(state, { error: 'token_exchange_failed' }));
    }

    // Fetch user info from Google
    let googleUser;
    try {
      const userInfoResponse = await fetchWithTimeout('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        timeoutMs: 10_000,
      });
      googleUser = await userInfoResponse.json();
    } catch (fetchErr) {
      logger.error({ err: fetchErr.message }, 'Google userinfo fetch network error');
      return res.redirect(buildRedirectUrl(state, { error: 'userinfo_network_error' }));
    }

    if (!googleUser.id || !googleUser.email) {
      logger.error({ data: { id: googleUser.id, hasEmail: !!googleUser.email } }, 'Google user info missing id or email');
      return res.redirect(buildRedirectUrl(state, { error: 'missing_user_info' }));
    }

    const googleEmail = googleUser.email.toLowerCase();
    assertCleanIdentifier(googleEmail, 'email');
    assertCleanIdentifier(googleUser.id, 'google_id');
    let user = await findAndLinkUser({ email: googleEmail, google_id: googleUser.id });
    if (!user) {
      const googlePhone = `google:${googleUser.id}`;
      user = await createUser(googlePhone, googleUser.name || googleUser.email || 'User');
      try {
        const linked = await linkUserIdentity(user.id, { email: googleEmail, google_id: googleUser.id });
        if (linked) user = linked;
      } catch (linkErr) {
        if (linkErr.code === '23505') {
          return res.redirect(buildRedirectUrl(state, { error: 'identity_conflict' }));
        }
        throw linkErr;
      }
    }

    // Generate a short-lived, single-use auth code instead of putting the JWT in the URL.
    // The client exchanges this code via POST /auth/exchange-code (see security audit M1).
    const authCode = crypto.randomBytes(32).toString('hex');
    const token = await signToken({ userId: user.id, phone: user.phone });
    await redis.set(`auth_code:${authCode}`, JSON.stringify({
      token,
      userId: user.id,
      name: user.name || '',
    }), 'EX', AUTH_CODE_TTL);
    res.redirect(buildRedirectUrl(state, { code: authCode }));
  } catch (err) {
    if (err.code === 'USER_DELETED') return res.redirect(buildRedirectUrl(state, { error: 'account_deleted' }));
    logger.error({ err: err.message }, 'Google OAuth callback error');
    res.redirect(buildRedirectUrl(state, { error: 'server_error' }));
  }
});

// POST /auth/exchange-code — exchange a short-lived auth code for a JWT
// This replaces the pattern of sending JWTs in redirect URLs (security audit M1)
router.post('/exchange-code', exchangeCodeLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: { code: 'AUTH_CODE_REQUIRED', message: 'Authorization code is required.' } });
    }
    // Atomically fetch and delete — prevents a concurrent request from replaying the same code
    const key = `auth_code:${code}`;
    const stored = await redis.call('GETDEL', key);
    if (!stored) {
      return res.status(401).json({ error: { code: 'INVALID_AUTH_CODE', message: 'Invalid or expired authorization code.' } });
    }
    let data;
    try {
      data = JSON.parse(stored);
    } catch {
      // Do not log the key — it contains the raw auth code
      logger.error('Corrupt auth_code payload in Redis — unparseable JSON');
      return res.status(500).json({ error: { code: 'EXCHANGE_CODE_ERROR', message: 'Failed to exchange authorization code.' } });
    }
    if (!data || typeof data.token !== 'string' || !data.userId) {
      logger.error('Corrupt auth_code payload in Redis — unexpected structure');
      return res.status(500).json({ error: { code: 'EXCHANGE_CODE_ERROR', message: 'Failed to exchange authorization code.' } });
    }
    setAuthCookie(res, data.token);
    res.json(authResponse(req, data.token, { id: data.userId, name: data.name }));
  } catch (err) {
    logger.error({ err: err.message }, 'Exchange code error');
    res.status(500).json({ error: { code: 'EXCHANGE_CODE_ERROR', message: 'Failed to exchange authorization code.' } });
  }
});

// POST /auth/social — verify Google/Apple ID token, return JWT
router.post('/social', socialAuthLimiter, async (req, res) => {
  try {
    const { provider: authProvider, token } = req.body;
    if (!authProvider || !token) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Provider and token are required.' } });
    }
    if (!['google', 'apple'].includes(authProvider)) {
      return res.status(400).json({ error: { code: 'UNSUPPORTED_PROVIDER', message: 'Unsupported provider. Use "google" or "apple".' } });
    }

    let socialId, socialName, socialEmail;

    if (authProvider === 'google') {
      // Verify Google ID token using google-auth-library
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        return res.status(401).json({ error: { code: 'INVALID_GOOGLE_TOKEN', message: 'Invalid Google token.' } });
      }
      socialId = payload.sub;
      socialName = payload.name || payload.email || 'User';
      socialEmail = payload.email;
    } else if (authProvider === 'apple') {
      // Reject immediately if Apple audience is not configured — without this,
      // audience validation inside verifyAppleToken would be skipped, allowing
      // any Apple-signed JWT to pass as a valid Wingman token.
      if (!process.env.APPLE_CLIENT_ID) {
        logger.error('APPLE_CLIENT_ID is not configured — refusing Apple sign-in');
        return res.status(500).json({ error: { code: 'SERVER_MISCONFIGURED', message: 'Apple sign-in is not available.' } });
      }
      // Cryptographically verify Apple identity token against Apple's JWKS
      try {
        const payload = await verifyAppleToken(token);
        if (!payload.sub) {
          return res.status(401).json({ error: { code: 'INVALID_APPLE_TOKEN', message: 'Invalid Apple token.' } });
        }
        socialId = payload.sub;
        socialEmail = payload.email;
        socialName = req.body.name || socialEmail || 'Apple User';
      } catch (appleErr) {
        logger.error({ err: appleErr.message }, 'Apple token verification failed');
        return res.status(401).json({ error: { code: 'INVALID_APPLE_TOKEN', message: 'Invalid or expired Apple token.' } });
      }
    }

    const normalizedSocialEmail = socialEmail ? socialEmail.toLowerCase() : undefined;
    if (normalizedSocialEmail) assertCleanIdentifier(normalizedSocialEmail, 'email');
    assertCleanIdentifier(socialId, 'social_id');
    const identifiers = { email: normalizedSocialEmail };
    if (authProvider === 'google') identifiers.google_id = socialId;
    if (authProvider === 'apple') identifiers.apple_id = socialId;

    let user = await findAndLinkUser(identifiers);
    if (!user) {
      const syntheticPhone = `${authProvider}:${socialId}`;
      user = await createUser(syntheticPhone, socialName);
      try {
        const linked = await linkUserIdentity(user.id, identifiers);
        if (linked) user = linked;
      } catch (linkErr) {
        if (linkErr.code === '23505') {
          return res.status(409).json({ error: { code: 'IDENTITY_CONFLICT', message: 'This email or social account is already linked to another user.' } });
        }
        throw linkErr;
      }
    }

    const jwtToken = await signToken({ userId: user.id, phone: user.phone });
    setAuthCookie(res, jwtToken);
    res.json(authResponse(req, jwtToken, { id: user.id, name: user.name }));
  } catch (err) {
    if (err.code === 'USER_DELETED') return res.status(403).json({ error: { code: 'USER_DELETED', message: 'Account has been deleted.' } });
    logger.error({ err: err.message }, 'Social auth error');
    res.status(500).json({ error: { code: 'SOCIAL_AUTH_ERROR', message: 'Social sign-in failed.' } });
  }
});

// GET /auth/me — current user info + stats
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { query: dbQuery } = require('../db');
    const [appsResult, workflowsResult, messagesResult] = await Promise.all([
      dbQuery('SELECT COUNT(*) FROM connected_apps WHERE user_id = $1', [req.user.id]),
      dbQuery('SELECT COUNT(*) FROM workflows WHERE user_id = $1 AND active = true', [req.user.id]),
      dbQuery('SELECT COUNT(*) FROM conversation_history WHERE user_id = $1 AND role = $2', [req.user.id, 'user']),
    ]);
    res.json({
      id: req.user.id,
      phone: req.user.phone,
      name: req.user.name,
      preferences: req.user.preferences || {},
      stats: {
        apps: parseInt(appsResult.rows[0].count, 10),
        workflows: parseInt(workflowsResult.rows[0].count, 10),
        messages: parseInt(messagesResult.rows[0].count, 10),
      },
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Auth me error');
    res.status(500).json({ error: { code: 'USER_INFO_ERROR', message: 'Failed to fetch user info.' } });
  }
});

// POST /auth/set-pin
router.post('/set-pin', requireAuth, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return res.status(400).json({ error: { code: 'INVALID_PIN', message: 'PIN must be 4-8 numeric digits.' } });
    }

    // bcrypt with cost 12 - replaces SHA-256+pepper (see SECURITY-AUDIT C3)
    const pinHash = await bcrypt.hash(pin, 12);
    await updateUserPin(req.user.id, pinHash);

    res.json({ success: true, message: 'PIN set successfully.' });
  } catch (err) {
    logger.error({ err: err.message }, 'Set PIN error');
    res.status(500).json({ error: { code: 'SET_PIN_ERROR', message: 'Failed to set PIN.' } });
  }
});

// POST /auth/verify-pin
router.post('/verify-pin', requireAuth, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return res.status(400).json({ error: { code: 'INVALID_PIN', message: 'PIN must be 4-8 digits.' } });
    }

    // Escalating lockout: cumulative failures trigger exponentially longer lockouts.
    // This prevents brute-forcing 4-digit PINs across multiple rate-limit windows.
    const lockoutKey = `pin_lockout:${req.user.id}`;
    const cumulativeKey = `pin_cumulative_fails:${req.user.id}`;

    const lockoutTTL = await redis.ttl(lockoutKey);
    if (lockoutTTL > 0) {
      const retryMin = Math.ceil(lockoutTTL / 60);
      return res.status(429).json({ error: { code: 'ACCOUNT_LOCKED', message: `Account temporarily locked due to too many failed PIN attempts. Try again in ${retryMin} minute(s).` } });
    }

    // Per-window rate limit: max 5 attempts per 15 minutes
    const attemptKey = `pin_verify_attempts:${req.user.id}`;
    const attempts = parseInt(await redis.get(attemptKey) || '0', 10);
    if (attempts >= 5) {
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many PIN verification attempts. Try again later.' } });
    }

    // Always run bcrypt.compare to prevent timing side-channel that reveals
    // whether an account has a PIN set.
    const hashToCheck = req.user.pin_hash || DUMMY_HASH;
    const valid = await bcrypt.compare(pin, hashToCheck);

    if (!req.user.pin_hash) {
      return res.status(400).json({ error: { code: 'NO_PIN_SET', message: 'No PIN set for this account.' } });
    }

    if (!valid) {
      // Per-window counter
      const failCount = await redis.incr(attemptKey);
      await redis.expire(attemptKey, 15 * 60);

      // Cumulative counter for escalating lockout (persists across windows, 24h TTL)
      const cumulative = await redis.incr(cumulativeKey);
      if (cumulative === 1) await redis.expire(cumulativeKey, 24 * 60 * 60);

      // Escalating lockout thresholds: 10 → 1h, 15 → 4h, 20 → 24h
      let lockoutSeconds = 0;
      if (cumulative >= 20) lockoutSeconds = 24 * 60 * 60;
      else if (cumulative >= 15) lockoutSeconds = 4 * 60 * 60;
      else if (cumulative >= 10) lockoutSeconds = 60 * 60;

      if (lockoutSeconds > 0) {
        await redis.set(lockoutKey, '1', 'EX', lockoutSeconds);
      }
    } else {
      await redis.del(attemptKey);
      await redis.del(cumulativeKey);
      await redis.del(lockoutKey);
    }

    res.json({ success: true, valid });
  } catch (err) {
    logger.error({ err: err.message }, 'Verify PIN error');
    res.status(500).json({ error: { code: 'VERIFY_PIN_ERROR', message: 'Failed to verify PIN.' } });
  }
});

// DELETE /auth/account — permanently delete the authenticated user's account and all data
// Required for GDPR/CCPA compliance and Apple App Store guidelines.
// Requires explicit confirmDeletion flag (CSRF signal) and PIN confirmation (if set).
router.delete('/account', requireAuth, async (req, res) => {
  try {
    const { pin, confirmDeletion } = req.body || {};

    // Require explicit opt-in to prevent accidental or CSRF-driven deletion.
    // A cross-site attacker cannot forge an arbitrary JSON body when the auth
    // cookie is sameSite:lax, making this an effective CSRF guard.
    if (confirmDeletion !== true) {
      return res.status(400).json({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Set confirmDeletion: true to confirm account deletion.' } });
    }

    // If user has a PIN set, require it as a second factor.
    // Always run bcrypt.compare when a PIN is supplied to prevent timing
    // side-channel that reveals whether the account has a PIN enabled.
    if (req.user.pin_hash || (pin && typeof pin === 'string')) {
      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ error: { code: 'PIN_REQUIRED', message: 'PIN confirmation is required to delete your account.' } });
      }
      const hashToCheck = req.user.pin_hash || DUMMY_HASH;
      const valid = await bcrypt.compare(pin, hashToCheck);
      if (!req.user.pin_hash) {
        // No PIN set — proceed with deletion (bcrypt ran only for timing parity)
      } else if (!valid) {
        return res.status(403).json({ error: { code: 'INVALID_PIN', message: 'Incorrect PIN.' } });
      }
    }

    await deleteUser(req.user.id);

    // Blacklist ALL tokens for this user permanently.  The user row is
    // hard-deleted, so there is no reason for this revocation to ever
    // expire.  We use a 10-year TTL (Redis doesn't support "no expiry"
    // via the SET EX variant) which far outlasts any JWT or refresh window.
    const delTtl = 10 * 365 * 86400; // ~10 years
    const delKey = `user_deleted:${req.user.id}`;
    await Promise.all([
      redis.set(delKey, '1', 'EX', delTtl),
      persistBlacklistEntry(delKey, '1', delTtl),
    ]);

    clearAuthCookie(res);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, 'Delete account error');
    res.status(500).json({ error: { code: 'DELETE_ACCOUNT_ERROR', message: 'Failed to delete account. Please try again.' } });
  }
});

// POST /auth/refresh — issue a new JWT and revoke the old one.
// Accepts tokens that expired within the last 7 days so clients can
// silently extend sessions without forcing re-authentication.
const REFRESH_GRACE_SECONDS = 7 * 24 * 60 * 60; // 7 days

router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    // Extract token
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
      token = req.cookies[AUTH_COOKIE_NAME];
    }
    if (!token) {
      return res.status(401).json({ error: { code: 'TOKEN_REQUIRED', message: 'Authorization token required.' } });
    }

    // Verify token — allow recently expired tokens within the grace window
    let oldPayload = verifyToken(token);
    if (!oldPayload) {
      oldPayload = verifyToken(token, { clockTolerance: REFRESH_GRACE_SECONDS });
      if (!oldPayload) {
        return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Token cannot be refreshed.' } });
      }
    }

    // Reject revoked tokens — stolen tokens should not be refreshable
    if (await isTokenRevoked(oldPayload.jti, oldPayload.userId, oldPayload.iat)) {
      return res.status(401).json({ error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked.' } });
    }

    // Verify user still exists
    let user;
    try {
      user = await getUserById(oldPayload.userId);
    } catch (err) {
      logger.error({ err: err.message }, '[auth] DB error during token refresh user lookup');
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to verify user. Please try again.' } });
    }
    if (!user) {
      return res.status(401).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
    }

    const newToken = await signToken({ userId: oldPayload.userId, phone: oldPayload.phone });

    // Blacklist the old token so it cannot be reused or refreshed again.
    // Use remaining lifetime + refresh grace window to cover expired-but-
    // refreshable tokens (whose natural TTL is already <= 0).
    if (oldPayload.jti) {
      const naturalTtl = oldPayload.exp - Math.floor(Date.now() / 1000);
      const ttl = Math.max(naturalTtl, 0) + REFRESH_GRACE_SECONDS;
      const key = `blacklist:${oldPayload.jti}`;
      await Promise.all([
        redis.set(key, '1', 'EX', ttl),
        persistBlacklistEntry(key, '1', ttl),
      ]);
    }

    setAuthCookie(res, newToken);
    res.json(authResponse(req, newToken, { id: user.id, name: user.name }));
  } catch (err) {
    if (err.code === 'USER_DELETED') return res.status(403).json({ error: { code: 'USER_DELETED', message: 'Account has been deleted.' } });
    logger.error({ err: err.message }, 'Token refresh error');
    res.status(500).json({ error: { code: 'REFRESH_ERROR', message: 'Token refresh failed.' } });
  }
});

// POST /auth/logout — revoke JWT and clear the httpOnly auth cookie
router.post('/logout', requireAuth, async (req, res) => {
  try {
    // Extract token from Authorization header, request body, or cookie.
    // Body fallback supports navigator.sendBeacon() which cannot set headers.
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.body && req.body.token) {
      token = req.body.token;
    } else if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
      token = req.cookies[AUTH_COOKIE_NAME];
    }

    if (token) {
      // Accept expired tokens within the refresh grace window so that
      // logout can blacklist tokens that are still refreshable.
      let payload = verifyToken(token);
      if (!payload) {
        payload = verifyToken(token, { clockTolerance: REFRESH_GRACE_SECONDS });
      }
      if (payload && payload.jti) {
        // Blacklist for the remaining lifetime + refresh grace window so
        // expired-but-refreshable tokens are also covered.
        const naturalTtl = payload.exp - Math.floor(Date.now() / 1000);
        const ttl = Math.max(naturalTtl, 0) + REFRESH_GRACE_SECONDS;
        const key = `blacklist:${payload.jti}`;
        await Promise.all([
          redis.set(key, '1', 'EX', ttl),
          persistBlacklistEntry(key, '1', ttl),
        ]);
      }
    }

    clearAuthCookie(res);
    res.json({ success: true });
  } catch (err) {
    // Still clear cookie even if blacklisting fails
    clearAuthCookie(res);
    res.json({ success: true });
  }
});

// POST /auth/logout-all — revoke all active sessions for the authenticated user.
// Useful when a token may be compromised: the user can invalidate every JWT
// issued before this moment without needing the compromised token itself.
router.post('/logout-all', requireAuth, async (req, res) => {
  try {
    await invalidateUserSessions(req.user.id);
    clearAuthCookie(res);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, 'Logout-all error');
    res.status(500).json({ error: { code: 'LOGOUT_ALL_ERROR', message: 'Failed to revoke sessions. Please try again.' } });
  }
});

/**
 * Invalidate all existing sessions for a user by recording a timestamp in Redis.
 * Tokens issued before this timestamp are rejected by isTokenRevoked().
 * Used when identity fields change to prevent session fixation attacks.
 */
async function invalidateUserSessions(userId) {
  // Store as Unix timestamp; tokens with iat <= this value are rejected.
  // TTL covers JWT lifetime (24h) + refresh grace window (7d) so the key
  // persists until all affected tokens can no longer be refreshed.
  const ttl = 86400 + REFRESH_GRACE_SECONDS;
  const key = `user_sessions_invalidated:${userId}`;
  const value = Math.floor(Date.now() / 1000).toString();
  await Promise.all([
    redis.set(key, value, 'EX', ttl),
    persistBlacklistEntry(key, value, ttl),
  ]);
}

/**
 * Check if a token has been revoked.
 * Uses Redis as a fast cache with PostgreSQL as the persistent authoritative
 * store.  After a Redis restart, new writes may populate some keys while old
 * blacklist entries are lost — so we always fall through to PostgreSQL when
 * Redis reports "not revoked" unless it had data for every key we checked.
 * @param {string} jti - JWT ID
 * @param {number|string} userId - User ID
 * @param {number} [iat] - Token issued-at timestamp (Unix seconds)
 */
async function isTokenRevoked(jti, userId, iat) {
  // Fail closed: tokens without a jti cannot be checked against the blacklist,
  // so treat them as revoked to prevent bypass via legacy or crafted tokens.
  if (!jti) return true;

  // Build the list of keys to check
  const tokenKey = `blacklist:${jti}`;
  const keys = [tokenKey];
  if (userId) {
    keys.push(`user_deleted:${userId}`);
    keys.push(`user_sessions_invalidated:${userId}`);
  }

  // Fast path: check Redis first — a positive hit is authoritative
  try {
    const redisResults = await Promise.all(keys.map(k => redis.get(k)));
    if (redisResults[0] === '1') return true;
    if (userId && redisResults[1] === '1') return true;
    if (userId && redisResults[2] && iat && parseInt(redisResults[2], 10) >= iat) return true;

    // Trust the negative only if Redis had values for ALL keys we queried.
    // A partial miss (some null, some non-null) could indicate a restart that
    // lost some blacklist entries while new ones were written — fall through.
    if (redisResults.every(r => r !== null)) return false;
  } catch {
    // Redis unavailable — fall through to PostgreSQL
  }

  // Authoritative check: PostgreSQL persistent blacklist
  try {
    const pgRows = await checkBlacklistEntries(keys);
    if (!pgRows.length) {
      // Token is not revoked.  Cache "not-revoked" sentinels in Redis so
      // subsequent requests within the TTL window hit the fast path and skip
      // the PG round-trip.  Without this, every normal request falls through
      // to PG because none of the blacklist keys exist in Redis (all null),
      // failing the `every(r => r !== null)` trust check above.
      _cacheNegativeBlacklist(keys).catch(() => {});
      return false;
    }

    const pgMap = Object.fromEntries(pgRows.map(r => [r.key, r.value]));
    if (pgMap[tokenKey] === '1') {
      _restoreToRedis(tokenKey, '1').catch(() => {});
      return true;
    }
    if (userId && pgMap[`user_deleted:${userId}`] === '1') {
      _restoreToRedis(`user_deleted:${userId}`, '1').catch(() => {});
      return true;
    }
    if (userId && pgMap[`user_sessions_invalidated:${userId}`] && iat) {
      const ts = parseInt(pgMap[`user_sessions_invalidated:${userId}`], 10);
      if (ts >= iat) {
        _restoreToRedis(`user_sessions_invalidated:${userId}`, pgMap[`user_sessions_invalidated:${userId}`]).catch(() => {});
        return true;
      }
    }

    // PG had rows but none matched this token's revocation conditions.
    // Cache sentinels for the keys that weren't in PG so subsequent checks
    // can trust the Redis negative.
    const missingKeys = keys.filter(k => !(k in pgMap));
    if (missingKeys.length) _cacheNegativeBlacklist(missingKeys).catch(() => {});
  } catch (err) {
    // Fail closed: if PG is also unavailable, reject the token
    logger.error({ err: err.message }, 'Blacklist PG fallback failed — failing closed');
    return true;
  }

  // Safety net: if the user was hard-deleted from the DB (and the
  // revocation entries in Redis/PG have expired or been evicted),
  // reject the token by confirming the user no longer exists.
  if (userId) {
    try {
      const user = await getUserById(userId);
      if (!user) return true;
    } catch {
      // Fail closed: if we can't verify user existence, reject
      return true;
    }
  }

  return false;
}

/**
 * Re-populate a blacklist entry into Redis after discovering it only in
 * PostgreSQL, so subsequent checks hit the fast path.
 * Uses the max revocation TTL (JWT lifetime + refresh grace) as a safe
 * upper bound; PG's expires_at remains the authoritative expiry.
 */
async function _restoreToRedis(key, value) {
  try {
    // user_deleted entries are permanent; other revocations use the
    // standard JWT-lifetime + refresh-grace window.
    const ttl = key.startsWith('user_deleted:')
      ? 10 * 365 * 86400
      : 86400 + REFRESH_GRACE_SECONDS;
    await redis.set(key, value, 'EX', ttl);
  } catch {
    // Ignore — Redis may still be recovering
  }
}

// TTL for negative-blacklist sentinels cached in Redis (seconds).
// Short enough that a revocation is picked up promptly, long enough to
// avoid hammering PG on every authenticated request.
const NEGATIVE_BLACKLIST_TTL = parseInt(process.env.NEGATIVE_BLACKLIST_TTL || '300', 10);

/**
 * Cache "not-revoked" sentinel values ('0') in Redis for the given keys.
 * This populates Redis so that the `every(r => r !== null)` trust check in
 * isTokenRevoked returns true on subsequent requests, preventing unnecessary
 * PG round-trips for tokens that are confirmed non-revoked.
 *
 * Uses NX (set-if-not-exists) so that a concurrent revocation that wrote '1'
 * or a real timestamp is never overwritten by a stale '0'.
 */
async function _cacheNegativeBlacklist(keys) {
  if (!keys.length) return;
  try {
    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.set(key, '0', 'EX', NEGATIVE_BLACKLIST_TTL, 'NX');
    }
    await pipeline.exec();
  } catch {
    // Best-effort — Redis may be recovering
  }
}

module.exports = router;
module.exports.verifyToken = verifyToken;
module.exports.isTokenRevoked = isTokenRevoked;
module.exports.AUTH_COOKIE_NAME = AUTH_COOKIE_NAME;
