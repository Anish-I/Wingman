const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const { provider } = require('../services/messaging');
const { getUserByPhone, getUserById, createUser, updateUserPin } = require('../db/queries');

const router = express.Router();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
const JWT_ISSUER = 'wingman';
const JWT_AUDIENCE = 'wingman-app';
const OTP_TTL = 600; // 10 minutes

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
    expiresIn: expiresInSeconds,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch {
    return null;
  }
}

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

    const otp = crypto.randomInt(100000, 999999).toString();
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

    // Rate limit: max 5 failed attempts per phone per 10 minutes
    const attemptKey = `otp_attempts:${phone}`;
    const attempts = parseInt(await redis.get(attemptKey) || '0', 10);
    if (attempts >= 5) {
      return res.status(429).json({ error: 'Too many verification attempts. Try again in 10 minutes.' });
    }

    const stored = await redis.get(`otp:${phone}`);
    if (!stored || stored !== code) {
      const newCount = await redis.incr(attemptKey);
      // Always set TTL after incr to prevent keys persisting without expiry
      await redis.expire(attemptKey, OTP_TTL);
      console.log(`[otp-rate-limit] phone=${phone} attempts=${newCount} ttl=${OTP_TTL}s key=${attemptKey}`);
      return res.status(401).json({ error: 'Invalid or expired OTP.' });
    }

    await redis.del(`otp:${phone}`);
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

// POST /auth/google
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Authorization code is required.' });
    }

    // Exchange the authorization code for tokens with Google
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: idToken,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: req.body.redirect_uri || 'http://localhost:3000/auth/callback',
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

// GET /auth/me — current user info
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required.' });
    }
    const payload = verifyToken(authHeader.slice(7));
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    const user = await getUserById(payload.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({
      id: user.id,
      phone: user.phone,
      name: user.name,
      preferences: user.preferences || {},
    });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Failed to fetch user info.' });
  }
});

// POST /auth/set-pin
router.post('/set-pin', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required.' });
    }

    const payload = verifyToken(authHeader.slice(7));
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    const { pin } = req.body;
    if (!pin || pin.length < 4 || pin.length > 8) {
      return res.status(400).json({ error: 'PIN must be 4-8 digits.' });
    }

    // bcrypt with cost 12 - replaces SHA-256+pepper (see SECURITY-AUDIT C3)
    const pinHash = await bcrypt.hash(pin, 12);
    await updateUserPin(payload.userId, pinHash);

    res.json({ success: true, message: 'PIN set successfully.' });
  } catch (err) {
    console.error('Set PIN error:', err);
    res.status(500).json({ error: 'Failed to set PIN.' });
  }
});

// POST /auth/verify-pin
router.post('/verify-pin', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required.' });
    }

    const payload = verifyToken(authHeader.slice(7));
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    const { pin } = req.body;
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4-8 digits.' });
    }

    // Rate limit: max 5 attempts per userId per 15 minutes
    const attemptKey = `pin_verify_attempts:${payload.userId}`;
    const attempts = parseInt(await redis.get(attemptKey) || '0', 10);
    if (attempts >= 5) {
      return res.status(429).json({ error: 'Too many PIN verification attempts. Try again later.' });
    }

    const user = await getUserById(payload.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (!user.pin_hash) {
      return res.status(400).json({ error: 'No PIN set for this account.' });
    }

    const valid = await bcrypt.compare(pin, user.pin_hash);

    if (!valid) {
      await redis.incr(attemptKey);
      if (attempts === 0) {
        await redis.expire(attemptKey, 15 * 60);
      }
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
