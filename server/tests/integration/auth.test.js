'use strict';

/**
 * Integration tests for auth routes.
 * Tests login flow returns JWT, and protected routes reject without token.
 * Uses real DB and Redis, mocks external services (SMS provider).
 */

const supertest = require('supertest');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

let app;
let pool;
let redis;

beforeAll(async () => {
  // Build a minimal Express app with auth and api routes
  const express = require('express');
  const cors = require('cors');

  pool = require('../../db').pool;
  redis = require('../../services/redis').redis;

  app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/auth', require('../../routes/auth'));
  app.use('/api', require('../../routes/api'));
});

afterAll(async () => {
  await pool.end().catch(() => {});
  await redis.quit().catch(() => {});
});

describe('POST /auth/signup + POST /auth/login', () => {
  const testEmail = `test-${Date.now()}@wingman-test.local`;
  const testPassword = 'TestPassword123!';

  afterAll(async () => {
    // Cleanup test user
    const emailKey = `email:${testEmail.toLowerCase()}`;
    await pool.query('DELETE FROM users WHERE phone = $1', [emailKey]).catch(() => {});
  });

  it('creates a new account and returns a JWT', async () => {
    const res = await supertest(app)
      .post('/auth/signup')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('id');
  });

  it('rejects duplicate signup', async () => {
    const res = await supertest(app)
      .post('/auth/signup')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');
  });

  it('logs in with correct credentials and returns a JWT', async () => {
    const res = await supertest(app)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
  });

  it('rejects login with wrong password', async () => {
    const res = await supertest(app)
      .post('/auth/login')
      .send({ email: testEmail, password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('preserves email login after linking a real phone via OTP', async () => {
    const otpEmail = `otp-${Date.now()}@wingman-test.local`;
    const phone = '+15555550123';
    const password = 'OtpPassword123!';

    const signupRes = await supertest(app)
      .post('/auth/signup')
      .send({ email: otpEmail, password });

    expect(signupRes.status).toBe(200);

    await redis.set(`otp:${phone}`, require('crypto').createHmac('sha256', process.env.JWT_SECRET).update('123456').digest('hex'), 'EX', 600);

    const verifyRes = await supertest(app)
      .post('/auth/verify-otp')
      .set('Authorization', `Bearer ${signupRes.body.token}`)
      .send({ phone, code: '123456' });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.phone).toBe(phone);

    const loginRes = await supertest(app)
      .post('/auth/login')
      .send({ email: otpEmail, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.id).toBe(signupRes.body.user.id);

    await pool.query('DELETE FROM users WHERE id = $1', [signupRes.body.user.id]).catch(() => {});
  });
});

describe('Protected routes reject without token', () => {
  it('GET /auth/me returns 401 without token', async () => {
    const res = await supertest(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_REQUIRED');
  });

  it('POST /api/chat returns 401 without token', async () => {
    const res = await supertest(app)
      .post('/api/chat')
      .send({ message: 'hello' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_REQUIRED');
  });

  it('GET /api/apps returns 401 without token', async () => {
    const res = await supertest(app).get('/api/apps');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_REQUIRED');
  });

  it('GET /auth/me returns user with valid token', async () => {
    // Create a test user and get token
    const testEmail = `authme-${Date.now()}@wingman-test.local`;
    const signupRes = await supertest(app)
      .post('/auth/signup')
      .send({ email: testEmail, password: 'TestPassword123!' });

    const token = signupRes.body.token;
    const res = await supertest(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');

    // Cleanup
    const emailKey = `email:${testEmail.toLowerCase()}`;
    await pool.query('DELETE FROM users WHERE phone = $1', [emailKey]).catch(() => {});
  });
});
