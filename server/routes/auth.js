const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createRedisClient } = require('../services/redis');
const jwksClient = require('jwks-rsa');
const { OAuth2Client } = require('google-auth-library');
const { provider } = require('../services/messaging');
const { getUserByPhone, getUserByEmail, getUserByGoogleId, getUserByAppleId, getUserById, createUser, getOrCreateUserByPhone, createUserByEmail, updateUserPin, linkUserIdentity, mergeUserAccounts, deleteUser } = require('../db/queries');
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
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
const JWT_ISSUER = 'wingman';
const JWT_AUDIENCE = 'wingman-app';
const OTP_TTL = 600; // 10 minutes
const AUTH_CODE_TTL = 60; // 60 seconds — short-lived, single-use
const AUTH_COOKIE_NAME = '__wingman_sess';

/** Set the httpOnly auth cookie for web clients. */
function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400 * 1000, // 24 hours — matches JWT expiry
    path: '/',
  });
}

/** Detect browser (web) clients — they use httpOnly cookies, not Bearer tokens.
 *  Browsers always send the Origin header on cross-origin credentialed requests. */
function isWebClient(req) {
  return !!req.headers.origin;
}

/** Build the auth response body.  Web clients receive no token (httpOnly cookie only). */
function authResponse(req, token, user) {
  const base = { success: true, user };
  if (isWebClient(req)) return base;
  return { ...base, token };
}

/** Clear the httpOnly auth cookie (logout). */
function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
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

// Rate limit OTP verification: 5 attempts per 15 minutes per phone (or IP fallback)
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.body?.phone || req.ip,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts. Try again in 15 minutes.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

function isValidPhone(phone) {
  return typeof phone === 'string' && /^\+[1-9]\d{1,14}$/.test(phone);
}

function signToken(payload, expiresInSeconds = 86400) {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: expiresInSeconds,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: crypto.randomUUID(),
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch {
    return null;
  }
}

async function findAndLinkUser({ phone, email, google_id, apple_id }) {
  let user = null;

  if (google_id) user = await getUserByGoogleId(google_id);
  if (!user && apple_id) user = await getUserByAppleId(apple_id);
  if (!user && email) user = await getUserByEmail(email);
  if (!user && phone) user = await getUserByPhone(phone);

  if (!user && google_id) user = await getUserByPhone(`google:${google_id}`);
  if (!user && apple_id) user = await getUserByPhone(`apple:${apple_id}`);
  if (!user && email) user = await getUserByPhone(`email:${email}`);

  if (!user) return null;

  const updates = {};
  if (email && user.email !== email) updates.email = email;
  if (google_id && user.google_id !== google_id) updates.google_id = google_id;
  if (apple_id && user.apple_id !== apple_id) updates.apple_id = apple_id;
  if (phone && isValidPhone(phone) && user.phone !== phone) {
    if (!user.phone || user.phone.startsWith('email:') || user.phone.startsWith('google:') || user.phone.startsWith('apple:')) {
      updates.phone = phone;
    }
  }

  if (Object.keys(updates).length > 0) {
    user = await linkUserIdentity(user.id, updates) || user;
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
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'Invalid email format.' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: { code: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 8 characters.' } });
    }

    const normalizedEmail = email.toLowerCase();
    assertCleanIdentifier(normalizedEmail, 'email');
    let user = await findAndLinkUser({ email: normalizedEmail });
    if (user && user.pin_hash) {
      return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    if (user) {
      await updateUserPin(user.id, passwordHash);
      user = await linkUserIdentity(user.id, { email: normalizedEmail }) || user;
    } else {
      // Atomically insert with email set to prevent concurrent-signup race.
      // createUserByEmail catches unique constraint violations and returns
      // the existing row if another request won the race.
      const { user: newUser, created } = await createUserByEmail(normalizedEmail, email.split('@')[0]);
      user = newUser;
      if (!created && user.pin_hash) {
        return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
      }
      await updateUserPin(user.id, passwordHash);
    }

    const token = signToken({ userId: user.id, phone: user.phone });
    setAuthCookie(res, token);
    res.json(authResponse(req, token, { id: user.id, name: user.name }));
  } catch (err) {
    console.error('Signup error:', err);
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

    // Redis-based per-email rate limiting (prevents distributed brute-force)
    const attemptKey = `login_attempts:${normalizedEmail}`;
    const attempts = parseInt(await redis.get(attemptKey) || '0', 10);
    if (attempts >= 5) {
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many failed login attempts for this account. Try again in 15 minutes.' } });
    }

    let user = await getUserByEmail(normalizedEmail);
    if (!user) user = await getUserByPhone(`email:${normalizedEmail}`);
    if (!user || !user.pin_hash) {
      // Increment counter even for non-existent accounts to prevent user enumeration timing
      await redis.incr(attemptKey);
      await redis.expire(attemptKey, 15 * 60);
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    }

    const valid = await bcrypt.compare(password, user.pin_hash);
    if (!valid) {
      await redis.incr(attemptKey);
      await redis.expire(attemptKey, 15 * 60);
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    }

    // Clear attempt counter on success
    await redis.del(attemptKey);
    if (!user.email) {
      user = await linkUserIdentity(user.id, { email: normalizedEmail }) || user;
    }
    const token = signToken({ userId: user.id, phone: user.phone });
    setAuthCookie(res, token);
    res.json(authResponse(req, token, { id: user.id, name: user.name }));
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: { code: 'LOGIN_ERROR', message: 'Login failed. Please try again.' } });
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
    const cooldownKey = `otp_cooldown:${phone}`;
    const cooldownExists = await redis.exists(cooldownKey);
    if (cooldownExists) {
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
      if (payload && payload.userId) {
        requestingUserId = payload.userId;
      }
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    // Store HMAC hash instead of plaintext — prevents Redis read access from leaking OTPs
    const otpHash = crypto.createHmac('sha256', JWT_SECRET).update(otp).digest('hex');
    await redis.set(`otp:${phone}`, otpHash, 'EX', OTP_TTL);

    // Track which user (if any) requested this OTP to prevent session fixation:
    // an attacker with token A must not link a victim's phone by intercepting their OTP.
    if (requestingUserId) {
      await redis.set(`otp_requester:${phone}`, String(requestingUserId), 'EX', OTP_TTL);
    } else {
      // Ensure no stale requester tag from a previous authenticated request
      await redis.del(`otp_requester:${phone}`);
    }

    // Set 60-second cooldown
    await redis.set(cooldownKey, '1', 'EX', 60);
    // Increment daily quota counter (24-hour TTL set on first request)
    await redis.incr(quotaKey);
    if (dailyCount === 0) {
      await redis.expire(quotaKey, 86400);
    }
    await provider.sendMessage(phone, `Your Wingman verification code is: ${otp}. It expires in 10 minutes.`);

    res.json({ success: true, message: 'OTP sent.' });
  } catch (err) {
    console.error('OTP request error:', err);
    res.status(500).json({ error: { code: 'OTP_SEND_ERROR', message: 'Failed to send OTP.' } });
  }
});

// POST /auth/verify-otp
router.post('/verify-otp', otpVerifyLimiter, async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Phone and code are required.' } });
    }

    // Redis-based per-phone rate limiting (prevents distributed brute-force across IPs)
    const attemptKey = `otp_attempts:${phone}`;
    const attempts = parseInt(await redis.get(attemptKey) || '0', 10);
    if (attempts >= 5) {
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many failed OTP attempts for this number. Try again in 10 minutes.' } });
    }

    const otpKey = `otp:${phone}`;
    // Atomically retrieve AND delete the OTP in one step to prevent race conditions
    // where concurrent requests both read the same OTP before either deletes it.
    const storedHash = await redis.call('GETDEL', otpKey);
    const codeStr = String(code);
    // Compare HMAC of submitted code against stored hash (constant-time)
    const submittedHash = crypto.createHmac('sha256', JWT_SECRET).update(codeStr).digest('hex');
    if (!storedHash || storedHash.length !== submittedHash.length || !crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(submittedHash))) {
      // Increment per-phone attempt counter with sliding TTL matching OTP lifetime
      await redis.incr(attemptKey);
      await redis.expire(attemptKey, OTP_TTL);
      return res.status(401).json({ error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP.' } });
    }

    // OTP already consumed by GETDEL above — clear attempt counter
    await redis.del(attemptKey);

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
      existingPayload = verifyToken(existingToken);
    }

    // Session-fixation guard: if the caller is authenticated and wants to link
    // this phone, the OTP must have been requested by the SAME user. This prevents
    // an attacker (token A) from intercepting a victim's OTP to steal their phone.
    if (existingPayload && existingPayload.userId) {
      const requesterKey = `otp_requester:${phone}`;
      const requesterId = await redis.call('GETDEL', requesterKey);
      if (!requesterId || String(requesterId) !== String(existingPayload.userId)) {
        return res.status(403).json({ error: { code: 'SESSION_MISMATCH', message: 'OTP was not requested by this account. Please request a new code.' } });
      }
    } else {
      // Unauthenticated login — clean up any requester tag
      await redis.del(`otp_requester:${phone}`);
    }

    let user;

    if (existingPayload && existingPayload.userId) {
      // Caller is already signed in — link phone to their account.
      // Use a transaction with SELECT ... FOR UPDATE to prevent concurrent
      // verify-otp requests from racing on the same merge operation.
      user = await withTransaction(async (txQuery) => {
        // Lock both user rows to serialize concurrent merge attempts
        const authedRes = await txQuery('SELECT * FROM users WHERE id = $1 FOR UPDATE', [existingPayload.userId]);
        const authedUser = authedRes.rows[0] || null;
        const phoneRes = await txQuery('SELECT * FROM users WHERE phone = $1 FOR UPDATE', [phone]);
        const phoneUser = phoneRes.rows[0] || null;

        if (phoneUser && authedUser && phoneUser.id !== authedUser.id) {
          // A separate phone-based account exists — merge it into the authenticated account
          await mergeUserAccounts(authedUser.id, phoneUser.id, txQuery);
        }

        if (authedUser) {
          // Set the real phone on the authenticated account
          const setClauses = ['phone = $1', 'updated_at = NOW()'];
          const setRes = await txQuery(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $2 RETURNING *`, [phone, authedUser.id]);
          return setRes.rows[0];
        } else {
          // Auth token references a deleted user — fall through to normal flow
          if (phoneUser) return phoneUser;
          const { user: newUser } = await getOrCreateUserByPhone(phone);
          return newUser;
        }
      });
    } else {
      // No existing session — normal phone-based login/signup.
      // Use atomic getOrCreateUserByPhone to prevent race where concurrent
      // OTP verifications for the same phone both create separate accounts.
      const result = await getOrCreateUserByPhone(phone);
      user = result.user;
    }

    const token = signToken({ userId: user.id, phone: user.phone });
    setAuthCookie(res, token);

    res.json(authResponse(req, token, { id: user.id, phone: user.phone, name: user.name }));
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: { code: 'OTP_VERIFY_ERROR', message: 'Failed to verify OTP.' } });
  }
});

// Allowed redirect_uri full URLs for Google OAuth token exchange
// Validates exact URL (origin + path), not just origin, to prevent path manipulation.
const ALLOWED_REDIRECT_URIS = [
  process.env.GOOGLE_REDIRECT_URI,
  ...(process.env.NEXT_PUBLIC_APP_URL ? [`${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`] : []),
  ...(process.env.CORS_ORIGIN ? [`${process.env.CORS_ORIGIN}/auth/callback`] : []),
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
router.post('/google/init-state', async (req, res) => {
  try {
    const nonce = crypto.randomBytes(32).toString('hex');
    await redis.set(`oauth_nonce:${nonce}`, '1', 'EX', 300); // 5-minute TTL
    const state = jwt.sign({ nonce, flow: 'spa' }, JWT_SECRET, { expiresIn: '5m' });
    res.json({ state });
  } catch (err) {
    console.error('Google init-state error:', err);
    res.status(500).json({ error: { code: 'INIT_STATE_ERROR', message: 'Failed to generate OAuth state.' } });
  }
});

// POST /auth/google
router.post('/google', async (req, res) => {
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
      statePayload = jwt.verify(state, JWT_SECRET);
    } catch {
      return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'Invalid or expired OAuth state. Please restart the login flow.' } });
    }
    // Verify and consume the nonce (single-use)
    const nonce = statePayload.nonce;
    if (!nonce) {
      return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state missing nonce.' } });
    }
    const nonceKey = `oauth_nonce:${nonce}`;
    const nonceExists = await redis.call('GETDEL', nonceKey);
    if (!nonceExists) {
      return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state nonce expired or already used. Please restart the login flow.' } });
    }

    // In production, NEVER accept redirect_uri from the client — use server config only.
    // In development, allow client-provided redirect_uri but validate full path against allowlist.
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
    const tokenResponse = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenParams),
      timeoutMs: 10_000,
    });
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('Google token exchange failed:', tokenData);
      return res.status(401).json({ error: { code: 'TOKEN_EXCHANGE_FAILED', message: 'Failed to exchange authorization code.' } });
    }

    // Get user info from Google
    const userInfoResponse = await fetchWithTimeout('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      timeoutMs: 10_000,
    });
    const googleUser = await userInfoResponse.json();

    if (!googleUser.id || !googleUser.email) {
      return res.status(401).json({ error: { code: 'GOOGLE_USER_INFO_FAILED', message: 'Could not retrieve Google user info.' } });
    }

    const googleEmail = googleUser.email.toLowerCase();
    assertCleanIdentifier(googleEmail, 'email');
    assertCleanIdentifier(googleUser.id, 'google_id');
    let user = await findAndLinkUser({ email: googleEmail, google_id: googleUser.id });
    if (!user) {
      const googlePhone = `google:${googleUser.id}`;
      user = await createUser(googlePhone, googleUser.name || googleUser.email);
      user = await linkUserIdentity(user.id, { email: googleEmail, google_id: googleUser.id }) || user;
    }

    const token = signToken({ userId: user.id, phone: user.phone });
    setAuthCookie(res, token);
    res.json(authResponse(req, token, { id: user.id, name: user.name }));
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: { code: 'GOOGLE_AUTH_ERROR', message: 'Google sign-in failed.' } });
  }
});

// GET /auth/google — redirect to Google OAuth consent screen
router.get('/google', async (req, res, next) => {
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
    const webOrigin = req.query.webOrigin || '';
    const nonce = crypto.randomBytes(32).toString('hex');
    await redis.set(`oauth_nonce:${nonce}`, '1', 'EX', 300); // 5-minute TTL

    // PKCE: generate code_verifier (stored server-side), send code_challenge to Google
    const pkce = generatePkce();
    await redis.set(`oauth_pkce:${nonce}`, pkce.verifier, 'EX', 300); // same TTL as nonce

    const state = jwt.sign({ platform, webOrigin, nonce }, JWT_SECRET, { expiresIn: '5m' });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    res.redirect(url);
  } catch (err) {
    next(err);
  }
});

// Verify and parse signed OAuth state (JWT with 5-minute expiry)
function parseOAuthState(stateParam) {
  const fallback = { platform: 'native', webOrigin: '' };
  try {
    if (!stateParam) return fallback;
    const payload = jwt.verify(stateParam, JWT_SECRET);
    return {
      platform: payload.platform || 'native',
      webOrigin: payload.webOrigin || '',
    };
  } catch (err) {
    console.warn('[oauth-state] Invalid or expired state token:', err.message);
    return fallback;
  }
}

// Allowed web origins for OAuth callback redirects (prevents open redirect)
const ALLOWED_WEB_ORIGINS = [
  'http://localhost:8098',
  'http://localhost:3000',
  'http://localhost:8081',
  'http://127.0.0.1:8098',
];

function buildRedirectUrl(state, params) {
  const qs = new URLSearchParams(params).toString();
  if (state.platform === 'web' && state.webOrigin) {
    // Validate webOrigin against allowlist
    if (ALLOWED_WEB_ORIGINS.includes(state.webOrigin) ||
        (process.env.CORS_ORIGIN && state.webOrigin === process.env.CORS_ORIGIN)) {
      return `${state.webOrigin}/connect/callback?${qs}`;
    }
  }
  return `wingman://connect/callback?${qs}`;
}

// GET /auth/google/callback — handle Google OAuth redirect
router.get('/google/callback', async (req, res) => {
  // Verify signed state token — reject if missing, expired, or tampered
  if (!req.query.state) {
    return res.status(400).json({ error: { code: 'MISSING_STATE', message: 'Missing OAuth state parameter.' } });
  }
  let statePayload;
  try {
    statePayload = jwt.verify(req.query.state, JWT_SECRET);
  } catch {
    return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'Invalid or expired OAuth state. Please restart the login flow.' } });
  }

  // Verify the nonce exists in Redis (ties state to a server-side session) and consume it
  const nonce = statePayload.nonce;
  if (!nonce) {
    return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state missing nonce. Please restart the login flow.' } });
  }
  const nonceKey = `oauth_nonce:${nonce}`;
  const nonceExists = await redis.call('GETDEL', nonceKey);
  if (!nonceExists) {
    return res.status(403).json({ error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state nonce expired or already used. Please restart the login flow.' } });
  }

  // Retrieve and consume PKCE code_verifier stored during GET /auth/google
  const pkceKey = `oauth_pkce:${nonce}`;
  const codeVerifier = await redis.call('GETDEL', pkceKey);

  const state = parseOAuthState(req.query.state);

  try {
    const { code, error } = req.query;

    if (error) {
      console.error('Google OAuth error:', error);
      return res.redirect(buildRedirectUrl(state, { error }));
    }

    if (!code) {
      return res.redirect(buildRedirectUrl(state, { error: 'missing_code' }));
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.error('Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
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
    const tokenResponse = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenParams),
      timeoutMs: 10_000,
    });
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('Google token exchange failed:', tokenData);
      return res.redirect(buildRedirectUrl(state, { error: 'token_exchange_failed' }));
    }

    // Fetch user info from Google
    const userInfoResponse = await fetchWithTimeout('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      timeoutMs: 10_000,
    });
    const googleUser = await userInfoResponse.json();

    if (!googleUser.id || !googleUser.email) {
      console.error('Google user info missing id or email:', googleUser);
      return res.redirect(buildRedirectUrl(state, { error: 'missing_user_info' }));
    }

    const googleEmail = googleUser.email.toLowerCase();
    assertCleanIdentifier(googleEmail, 'email');
    assertCleanIdentifier(googleUser.id, 'google_id');
    let user = await findAndLinkUser({ email: googleEmail, google_id: googleUser.id });
    if (!user) {
      const googlePhone = `google:${googleUser.id}`;
      user = await createUser(googlePhone, googleUser.name || googleUser.email);
      user = await linkUserIdentity(user.id, { email: googleEmail, google_id: googleUser.id }) || user;
    }

    // Generate a short-lived, single-use auth code instead of putting the JWT in the URL.
    // The client exchanges this code via POST /auth/exchange-code (see security audit M1).
    const authCode = crypto.randomBytes(32).toString('hex');
    const token = signToken({ userId: user.id, phone: user.phone });
    await redis.set(`auth_code:${authCode}`, JSON.stringify({
      token,
      userId: user.id,
      name: user.name || '',
    }), 'EX', AUTH_CODE_TTL);
    res.redirect(buildRedirectUrl(state, { code: authCode }));
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(buildRedirectUrl(state, { error: 'server_error' }));
  }
});

// POST /auth/exchange-code — exchange a short-lived auth code for a JWT
// This replaces the pattern of sending JWTs in redirect URLs (security audit M1)
router.post('/exchange-code', async (req, res) => {
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
      console.error('Corrupt auth_code payload in Redis for key:', key);
      return res.status(500).json({ error: { code: 'EXCHANGE_CODE_ERROR', message: 'Failed to exchange authorization code.' } });
    }
    setAuthCookie(res, data.token);
    res.json(authResponse(req, data.token, { id: data.userId, name: data.name }));
  } catch (err) {
    console.error('Exchange code error:', err);
    res.status(500).json({ error: { code: 'EXCHANGE_CODE_ERROR', message: 'Failed to exchange authorization code.' } });
  }
});

// POST /auth/social — verify Google/Apple ID token, return JWT
router.post('/social', async (req, res) => {
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
      socialName = payload.name || payload.email;
      socialEmail = payload.email;
    } else if (authProvider === 'apple') {
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
        console.error('Apple token verification failed:', appleErr.message);
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
      user = await linkUserIdentity(user.id, identifiers) || user;
    }

    const jwtToken = signToken({ userId: user.id, phone: user.phone });
    setAuthCookie(res, jwtToken);
    res.json(authResponse(req, jwtToken, { id: user.id, name: user.name }));
  } catch (err) {
    console.error('Social auth error:', err);
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
    console.error('Auth me error:', err);
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
    console.error('Set PIN error:', err);
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

    // Rate limit: max 5 attempts per userId per 15 minutes
    const attemptKey = `pin_verify_attempts:${req.user.id}`;
    const attempts = parseInt(await redis.get(attemptKey) || '0', 10);
    if (attempts >= 5) {
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many PIN verification attempts. Try again later.' } });
    }

    if (!req.user.pin_hash) {
      return res.status(400).json({ error: { code: 'NO_PIN_SET', message: 'No PIN set for this account.' } });
    }

    const valid = await bcrypt.compare(pin, req.user.pin_hash);

    if (!valid) {
      await redis.incr(attemptKey);
      // Always refresh TTL on each failure to create a proper sliding window,
      // preventing attackers from waiting out a stale TTL and retrying
      await redis.expire(attemptKey, 15 * 60);
    } else {
      await redis.del(attemptKey);
    }

    res.json({ success: true, valid });
  } catch (err) {
    console.error('Verify PIN error:', err);
    res.status(500).json({ error: { code: 'VERIFY_PIN_ERROR', message: 'Failed to verify PIN.' } });
  }
});

// DELETE /auth/account — permanently delete the authenticated user's account and all data
// Required for GDPR/CCPA compliance and Apple App Store guidelines.
// Requires PIN confirmation (if set) to prevent CSRF-driven account destruction.
router.delete('/account', requireAuth, async (req, res) => {
  try {
    const { pin } = req.body || {};

    // If user has a PIN set, require it for confirmation
    if (req.user.pin_hash) {
      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ error: { code: 'PIN_REQUIRED', message: 'PIN confirmation is required to delete your account.' } });
      }
      const valid = await bcrypt.compare(pin, req.user.pin_hash);
      if (!valid) {
        return res.status(403).json({ error: { code: 'INVALID_PIN', message: 'Incorrect PIN.' } });
      }
    }

    await deleteUser(req.user.id);
    clearAuthCookie(res);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: { code: 'DELETE_ACCOUNT_ERROR', message: 'Failed to delete account. Please try again.' } });
  }
});

// POST /auth/logout — revoke JWT and clear the httpOnly auth cookie
router.post('/logout', async (req, res) => {
  try {
    // Extract token from Authorization header or cookie
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
      token = req.cookies[AUTH_COOKIE_NAME];
    }

    if (token) {
      const payload = verifyToken(token);
      if (payload && payload.jti) {
        // Blacklist this token for its remaining lifetime
        const ttl = payload.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redis.set(`blacklist:${payload.jti}`, '1', 'EX', ttl);
        }
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

/**
 * Check if a token has been revoked (blacklisted in Redis).
 * Returns true if the token's jti is in the blacklist.
 */
async function isTokenRevoked(jti) {
  if (!jti) return false;
  const result = await redis.get(`blacklist:${jti}`);
  return result === '1';
}

module.exports = router;
module.exports.verifyToken = verifyToken;
module.exports.isTokenRevoked = isTokenRevoked;
module.exports.AUTH_COOKIE_NAME = AUTH_COOKIE_NAME;
