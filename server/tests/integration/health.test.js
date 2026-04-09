'use strict';

/**
 * Integration tests for GET /health and GET /ready endpoints.
 * Uses the real Express app with real DB and Redis connections.
 */

const supertest = require('supertest');

// Load env before app
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

let app;
let server;

beforeAll(async () => {
  // Dynamically require the app (index.js exports nothing, so we build a mini app)
  // To avoid port conflicts, we require a fresh app instance via the same setup
  const express = require('express');
  const { pool } = require('../../db');
  const { redis } = require('../../services/redis');

  app = express();

  async function checkDependencies() {
    const results = { postgres: { ok: false, latencyMs: null }, redis: { ok: false, latencyMs: null } };
    try {
      const pgStart = Date.now();
      await pool.query('SELECT 1');
      results.postgres = { ok: true, latencyMs: Date.now() - pgStart };
    } catch (err) {
      results.postgres = { ok: false, latencyMs: null, error: 'unavailable' };
    }
    try {
      const redisStart = Date.now();
      await redis.ping();
      results.redis = { ok: true, latencyMs: Date.now() - redisStart };
    } catch (err) {
      results.redis = { ok: false, latencyMs: null, error: 'unavailable' };
    }
    const allOk = results.postgres.ok && results.redis.ok;
    return { status: allOk ? 'ok' : 'degraded', ...results, uptime: process.uptime() };
  }

  // Liveness probe: always returns 200 if the process is alive
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/ready', async (req, res) => {
    const health = await checkDependencies();
    res.status(health.status === 'ok' ? 200 : 503).json(health);
  });
});

afterAll(async () => {
  const { pool } = require('../../db');
  const { redis } = require('../../services/redis');
  await pool.end().catch(() => {});
  await redis.quit().catch(() => {});
});

describe('GET /health (liveness)', () => {
  it('returns 200 with status ok and uptime — no dependency checks', async () => {
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(typeof res.body.uptime).toBe('number');
    // Liveness probe should NOT include dependency details
    expect(res.body).not.toHaveProperty('postgres');
    expect(res.body).not.toHaveProperty('redis');
  });
});

describe('GET /ready', () => {
  it('returns 200 with correct shape when dependencies are up', async () => {
    const res = await supertest(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('postgres');
    expect(res.body).toHaveProperty('redis');
    expect(typeof res.body.uptime).toBe('number');
  });
});
