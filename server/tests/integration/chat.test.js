'use strict';

/**
 * Integration tests for POST /api/chat endpoint.
 * Mocks LLM (orchestrator) and Composio, uses real DB and Redis.
 */

const supertest = require('supertest');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

let app;
let pool;
let redis;
let testToken;
let testUserId;

// Mock the orchestrator's processMessage to avoid real LLM calls
jest.mock('../../services/orchestrator', () => ({
  processMessage: jest.fn().mockResolvedValue('Mocked AI response: Hello!'),
}));

beforeAll(async () => {
  const express = require('express');
  const cors = require('cors');

  pool = require('../../db').pool;
  redis = require('../../services/redis').redis;

  app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/auth', require('../../routes/auth'));
  app.use('/api', require('../../routes/api'));

  // Create a test user to get a valid JWT
  const testEmail = `chat-test-${Date.now()}@wingman-test.local`;
  const signupRes = await supertest(app)
    .post('/auth/signup')
    .send({ email: testEmail, password: 'TestPassword123!' });

  testToken = signupRes.body.token;
  testUserId = signupRes.body.user.id;
});

afterAll(async () => {
  // Cleanup test user
  if (testUserId) {
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]).catch(() => {});
  }
  await pool.end().catch(() => {});
  await redis.quit().catch(() => {});
});

describe('POST /api/chat', () => {
  it('returns 401 without auth token', async () => {
    const res = await supertest(app)
      .post('/api/chat')
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when message is missing', async () => {
    const res = await supertest(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${testToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MESSAGE_REQUIRED');
  });

  it('returns 400 when message is empty string', async () => {
    const res = await supertest(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ message: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MESSAGE_REQUIRED');
  });

  it('returns 400 when message exceeds max length', async () => {
    const res = await supertest(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ message: 'x'.repeat(5000) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MESSAGE_TOO_LONG');
  });

  it('returns a reply from the mocked orchestrator', async () => {
    const res = await supertest(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ message: 'Hello Wingman' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reply');
    expect(res.body.reply).toBe('Mocked AI response: Hello!');
  });

  it('handles orchestrator errors gracefully', async () => {
    const { processMessage } = require('../../services/orchestrator');
    processMessage.mockRejectedValueOnce(new Error('LLM timeout'));

    const res = await supertest(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ message: 'Hello' });

    expect(res.status).toBe(500);
    expect(res.body.error).toHaveProperty('code');
  });
});
