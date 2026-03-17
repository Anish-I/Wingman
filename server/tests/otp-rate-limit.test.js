const express = require('express');
const rateLimit = require('express-rate-limit');
const supertest = require('supertest');

/**
 * Tests the express-rate-limit layer on /auth/verify-otp.
 * Isolated from Redis/DB — validates that the middleware alone
 * blocks brute-force attempts after 5 tries.
 */

function createTestApp() {
  const app = express();
  app.use(express.json());

  const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => req.body?.phone || req.ip,
    message: { error: 'Too many attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post('/auth/verify-otp', otpVerifyLimiter, (req, res) => {
    res.status(401).json({ error: 'Invalid or expired OTP.' });
  });

  return app;
}

describe('OTP verify rate limiting', () => {
  let app;
  let request;

  beforeEach(() => {
    app = createTestApp();
    request = supertest(app);
  });

  it('should allow the first 5 attempts and block the 6th with 429', async () => {
    const payload = { phone: '+15551234567', code: '000000' };

    for (let i = 1; i <= 5; i++) {
      const res = await request.post('/auth/verify-otp').send(payload);
      expect(res.status).toBe(401);
    }

    // 6th attempt must be rate-limited
    const blocked = await request.post('/auth/verify-otp').send(payload);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many attempts/i);
  });

  it('should rate limit per phone number independently', async () => {
    const phone1 = { phone: '+15551111111', code: '000000' };
    const phone2 = { phone: '+15552222222', code: '000000' };

    // Exhaust limit for phone1
    for (let i = 0; i < 5; i++) {
      await request.post('/auth/verify-otp').send(phone1);
    }

    // phone1 blocked
    const blocked = await request.post('/auth/verify-otp').send(phone1);
    expect(blocked.status).toBe(429);

    // phone2 should still be allowed
    const allowed = await request.post('/auth/verify-otp').send(phone2);
    expect(allowed.status).toBe(401);
  });
});
