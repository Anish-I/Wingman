const express = require('express');
const crypto = require('crypto');
const Redis = require('ioredis');
const { sendSMS } = require('../services/telnyx');
const { getUserByPhone, createUser, updateUserPin } = require('../db/queries');

const router = express.Router();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const jwtSecret = process.env.JWT_SECRET || 'textflow-dev-secret';
const OTP_TTL = 600; // 10 minutes

// Simple JWT implementation (sign / verify)
function signToken(payload, expiresInSeconds = 86400) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds })).toString('base64url');
  const signature = crypto.createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = crypto.createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url');
  if (signature !== expected) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// POST /auth/request-otp
router.post('/request-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redis.set(`otp:${phone}`, otp, 'EX', OTP_TTL);
    await sendSMS(phone, `Your TextFlow verification code is: ${otp}. It expires in 10 minutes.`);

    res.json({ success: true, message: 'OTP sent.' });
  } catch (err) {
    console.error('OTP request error:', err);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

// POST /auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code are required.' });
    }

    const stored = await redis.get(`otp:${phone}`);
    if (!stored || stored !== code) {
      return res.status(401).json({ error: 'Invalid or expired OTP.' });
    }

    await redis.del(`otp:${phone}`);

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

    const pinHash = crypto.createHash('sha256').update(pin + jwtSecret).digest('hex');
    await updateUserPin(payload.userId, pinHash);

    res.json({ success: true, message: 'PIN set successfully.' });
  } catch (err) {
    console.error('Set PIN error:', err);
    res.status(500).json({ error: 'Failed to set PIN.' });
  }
});

module.exports = router;
module.exports.verifyToken = verifyToken;
