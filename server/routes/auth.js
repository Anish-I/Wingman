const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const jwksClient = require('jwks-rsa');
const { OAuth2Client } = require('google-auth-library');
const { provider } = require('../services/messaging');
const { getUserByPhone, getUserById, createUser, updateUserPin } = require('../db/queries');

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
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  if (!header.kid) {
    throw new Error('Apple token missing kid in header.');
  }
  const signingKey = await appleJwksClient.getSigningKey(header.kid);
  const verifyOptions = {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
  };
  if (process.env.APPLE_CLIENT_ID) {
    verifyOptions.audience = process.env.APPLE_CLIENT_ID;
  } else {
    console.warn('APPLE_CLIENT_ID not set — skipping audience check for Apple token verification');
  }
  return jwt.verify(token, signingKey.getPublicKey(), verifyOptions);
}

const router = express.Router();
// Lazy require to avoid circular dependency (requireAuth imports verifyToken from this file)
let _requireAuth;
function requireAuth(req, res, next) {
  if (!_requireAuth) _requireAuth = require('../middleware/requireAuth');
  return _requireAuth(req, res, next);
}
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
const JWT_ISSUER = 'wingman';
const JWT_AUDIENCE = 'wingman-app';
const OTP_TTL = 600; // 10 minutes
const AUTH_CODE_TTL = 60; // 60 seconds — short-lived, single-use

// Rate limit login attempts: 10 per 15 minutes per IP (brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

// Rate limit signup attempts: 5 per 15 minutes per IP (abuse protection)
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-up attempts, please try again later.' },
});

// Rate limit OTP requests: 5 per 15 minutes per IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests, please try again later.' },
});

// Rate limit OTP verification: 5 attempts per 15 minutes per phone (or IP fallback)
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.body?.phone || req.ip,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
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

// POST /auth/signup — email/password registration
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Use email:<email> as synthetic phone key to fit existing schema
    const emailKey = `email:${email.toLowerCase()}`;
    let user = await getUserByPhone(emailKey);
    if (user) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    user = await createUser(emailKey, email.split('@')[0]);
    // Store password hash as pin_hash (reuse existing column)
    await updateUserPin(user.id, passwordHash);

    const token = signToken({ userId: user.id, phone: emailKey });
    res.json({ success: true, token, user: { id: user.id, name: user.name } });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Sign-up failed. Please try again.' });
  }
});

// POST /auth/login — email/password login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase();
    const emailKey = `email:${normalizedEmail}`;

    // Redis-based per-email rate limiting (prevents distributed brute-force)
    const attemptKey = `login_attempts:${normalizedEmail}`;
    const attempts = parseInt(await redis.get(attemptKey) || '0', 10);
    if (attempts >= 5) {
      return res.status(429).json({ error: 'Too many failed login attempts for this account. Try again in 15 minutes.' });
    }

    const user = await getUserByPhone(emailKey);
    if (!user || !user.pin_hash) {
      // Increment counter even for non-existent accounts to prevent user enumeration timing
      await redis.incr(attemptKey);
      await redis.expire(attemptKey, 15 * 60);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.pin_hash);
    if (!valid) {
      await redis.incr(attemptKey);
      await redis.expire(attemptKey, 15 * 60);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Clear attempt counter on success
    await redis.del(attemptKey);
    const token = signToken({ userId: user.id, phone: emailKey });
    res.json({ success: true, token, user: { id: user.id, name: user.name } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /auth/request-otp
router.post('/request-otp', otpLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone number format. Use E.164 (e.g. +15551234567).' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    await redis.set(`otp:${phone}`, otp, 'EX', OTP_TTL);
    await provider.sendMessage(phone, `Your Wingman verification code is: ${otp}. It expires in 10 minutes.`);

    res.json({ success: true, message: 'OTP sent.' });
  } catch (err) {
    console.error('OTP request error:', err);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

// POST /auth/verify-otp
router.post('/verify-otp', otpVerifyLimiter, async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code are required.' });
    }

    // Redis-based per-phone rate limiting (prevents distributed brute-force across IPs)
    const attemptKey = `otp_attempts:${phone}`;
    const attempts = parseInt(await redis.get(attemptKey) || '0', 10);
    if (attempts >= 5) {
      return res.status(429).json({ error: 'Too many failed OTP attempts for this number. Try again in 10 minutes.' });
    }

    // Atomically fetch and delete the OTP in one operation to prevent race conditions
    // where a concurrent request could read the same OTP between GET and DEL
    const otpKey = `otp:${phone}`;
    const stored = await redis.call('GETDEL', otpKey);
    const codeStr = String(code);
    if (!stored || stored.length !== codeStr.length || !crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(codeStr))) {
      // Increment per-phone attempt counter with sliding TTL matching OTP lifetime
      await redis.incr(attemptKey);
      await redis.expire(attemptKey, OTP_TTL);
      return res.status(401).json({ error: 'Invalid or expired OTP.' });
    }

    // Success — clear attempt counter (OTP already deleted by GETDEL above)
    await redis.del(attemptKey);

    let user = await getUserByPhone(phone);
    if (!user) {
      user = await createUser(phone);
    }

    const token = signToken({ userId: user.id, phone: user.phone });

    res.json({ success: true, token, user: { id: user.id, phone: user.phone, name: user.name } });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: 'Failed to verify OTP.' });
  }
});

// Allowed redirect_uri origins for Google OAuth token exchange
const ALLOWED_REDIRECT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8081',
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.CORS_ORIGIN,
].filter(Boolean);

function isAllowedRedirectUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  try {
    const parsed = new URL(uri);
    const origin = parsed.origin;
    return ALLOWED_REDIRECT_ORIGINS.includes(origin);
  } catch {
    return false;
  }
}

// POST /auth/google
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Authorization code is required.' });
    }

    // In production, NEVER accept redirect_uri from the client — use server config only.
    // In development, allow client-provided redirect_uri but validate against allowlist.
    const defaultRedirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback`;
    let finalRedirectUri;

    if (process.env.NODE_ENV === 'production') {
      // Production: ignore any client-supplied redirect_uri
      finalRedirectUri = process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri;
    } else {
      // Development: allow client override only if it passes the allowlist check
      const clientUri = req.body.redirect_uri;
      if (clientUri) {
        if (!isAllowedRedirectUri(clientUri)) {
          return res.status(400).json({ error: 'Invalid redirect_uri.' });
        }
        finalRedirectUri = clientUri;
      } else {
        finalRedirectUri = defaultRedirectUri;
      }
    }

    // Exchange the authorization code for tokens with Google
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: idToken,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: finalRedirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('Google token exchange failed:', tokenData);
      return res.status(401).json({ error: 'Failed to exchange authorization code.' });
    }

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userInfoResponse.json();

    if (!googleUser.id || !googleUser.email) {
      return res.status(401).json({ error: 'Could not retrieve Google user info.' });
    }

    // Use google:<id> as a synthetic phone key to fit existing schema
    const googlePhone = `google:${googleUser.id}`;
    let user = await getUserByPhone(googlePhone);
    if (!user) {
      user = await createUser(googlePhone, googleUser.name || googleUser.email);
    }

    const token = signToken({ userId: user.id, phone: googlePhone });
    res.json({ success: true, token, user: { id: user.id, name: user.name } });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Google sign-in failed.' });
  }
});

// GET /auth/google — redirect to Google OAuth consent screen
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Google OAuth not configured.' });
  }
  // Use server-configured redirect URI only — never accept from query params (open redirect risk)
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3001'}/auth/google/callback`;
  const scope = encodeURIComponent('openid email profile');
  // Sign the OAuth state with JWT_SECRET for CSRF protection (5-minute expiry)
  const platform = req.query.platform === 'web' ? 'web' : 'native';
  const webOrigin = req.query.webOrigin || '';
  const state = jwt.sign({ platform, webOrigin }, JWT_SECRET, { expiresIn: '5m' });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
  res.redirect(url);
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
  return `wingman://auth/callback?${qs}`;
}

// GET /auth/google/callback — handle Google OAuth redirect
router.get('/google/callback', async (req, res) => {
  // Verify signed state token — reject if missing, expired, or tampered
  if (!req.query.state) {
    return res.status(400).json({ error: 'Missing OAuth state parameter.' });
  }
  let stateValid = true;
  try {
    jwt.verify(req.query.state, JWT_SECRET);
  } catch {
    stateValid = false;
  }
  if (!stateValid) {
    return res.status(403).json({ error: 'Invalid or expired OAuth state. Please restart the login flow.' });
  }
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

    // Exchange auth code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('Google token exchange failed:', tokenData);
      return res.redirect(buildRedirectUrl(state, { error: 'token_exchange_failed' }));
    }

    // Fetch user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userInfoResponse.json();

    if (!googleUser.id || !googleUser.email) {
      console.error('Google user info missing id or email:', googleUser);
      return res.redirect(buildRedirectUrl(state, { error: 'missing_user_info' }));
    }

    // Find or create user using google:<id> as the synthetic phone key
    const googlePhone = `google:${googleUser.id}`;
    let user = await getUserByPhone(googlePhone);
    if (!user) {
      user = await createUser(googlePhone, googleUser.name || googleUser.email);
    }

    // Generate a short-lived, single-use auth code instead of putting the JWT in the URL.
    // The client exchanges this code via POST /auth/exchange-code (see security audit M1).
    const authCode = crypto.randomBytes(32).toString('hex');
    const token = signToken({ userId: user.id, phone: googlePhone });
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
      return res.status(400).json({ error: 'Authorization code is required.' });
    }
    // Atomically fetch and delete — prevents a concurrent request from replaying the same code
    const key = `auth_code:${code}`;
    const stored = await redis.call('GETDEL', key);
    if (!stored) {
      return res.status(401).json({ error: 'Invalid or expired authorization code.' });
    }
    const data = JSON.parse(stored);
    res.json({ success: true, token: data.token, user: { id: data.userId, name: data.name } });
  } catch (err) {
    console.error('Exchange code error:', err);
    res.status(500).json({ error: 'Failed to exchange authorization code.' });
  }
});

// POST /auth/social — verify Google/Apple ID token, return JWT
router.post('/social', async (req, res) => {
  try {
    const { provider: authProvider, token } = req.body;
    if (!authProvider || !token) {
      return res.status(400).json({ error: 'Provider and token are required.' });
    }
    if (!['google', 'apple'].includes(authProvider)) {
      return res.status(400).json({ error: 'Unsupported provider. Use "google" or "apple".' });
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
        return res.status(401).json({ error: 'Invalid Google token.' });
      }
      socialId = payload.sub;
      socialName = payload.name || payload.email;
      socialEmail = payload.email;
    } else if (authProvider === 'apple') {
      // Cryptographically verify Apple identity token against Apple's JWKS
      try {
        const payload = await verifyAppleToken(token);
        if (!payload.sub) {
          return res.status(401).json({ error: 'Invalid Apple token.' });
        }
        socialId = payload.sub;
        socialEmail = payload.email;
        socialName = req.body.name || socialEmail || 'Apple User';
      } catch (appleErr) {
        console.error('Apple token verification failed:', appleErr.message);
        return res.status(401).json({ error: 'Invalid or expired Apple token.' });
      }
    }

    // Use <provider>:<id> as synthetic phone key
    const syntheticPhone = `${authProvider}:${socialId}`;
    let user = await getUserByPhone(syntheticPhone);
    if (!user) {
      user = await createUser(syntheticPhone, socialName);
    }

    const jwtToken = signToken({ userId: user.id, phone: syntheticPhone });
    res.json({ success: true, token: jwtToken, user: { id: user.id, name: user.name } });
  } catch (err) {
    console.error('Social auth error:', err);
    res.status(500).json({ error: 'Social sign-in failed.' });
  }
});

// GET /auth/me — current user info
router.get('/me', requireAuth, async (req, res) => {
  try {
    res.json({
      id: req.user.id,
      phone: req.user.phone,
      name: req.user.name,
      preferences: req.user.preferences || {},
    });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Failed to fetch user info.' });
  }
});

// POST /auth/set-pin
router.post('/set-pin', requireAuth, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4-8 numeric digits.' });
    }

    // bcrypt with cost 12 - replaces SHA-256+pepper (see SECURITY-AUDIT C3)
    const pinHash = await bcrypt.hash(pin, 12);
    await updateUserPin(req.user.id, pinHash);

    res.json({ success: true, message: 'PIN set successfully.' });
  } catch (err) {
    console.error('Set PIN error:', err);
    res.status(500).json({ error: 'Failed to set PIN.' });
  }
});

// POST /auth/verify-pin
router.post('/verify-pin', requireAuth, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4-8 digits.' });
    }

    // Rate limit: max 5 attempts per userId per 15 minutes
    const attemptKey = `pin_verify_attempts:${req.user.id}`;
    const attempts = parseInt(await redis.get(attemptKey) || '0', 10);
    if (attempts >= 5) {
      return res.status(429).json({ error: 'Too many PIN verification attempts. Try again later.' });
    }

    if (!req.user.pin_hash) {
      return res.status(400).json({ error: 'No PIN set for this account.' });
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
    res.status(500).json({ error: 'Failed to verify PIN.' });
  }
});

module.exports = router;
module.exports.verifyToken = verifyToken;
