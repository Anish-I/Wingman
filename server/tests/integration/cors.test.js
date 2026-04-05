'use strict';

const express = require('express');
const cors = require('cors');
const supertest = require('supertest');

const { createCorsOptions } = require('../../config/cors');

describe('CORS middleware', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(cors(createCorsOptions(['https://allowed.example'])));
    app.get('/test', (_req, res) => {
      res.json({ ok: true });
    });
    app.use((err, _req, res, _next) => {
      res.status(err.status || 500).json({ error: err.message });
    });
  });

  it('allows requests without an Origin header (non-browser clients)', async () => {
    const res = await supertest(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // No CORS headers added for non-browser requests
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects requests from disallowed origins', async () => {
    const res = await supertest(app)
      .get('/test')
      .set('Origin', 'https://evil.example');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Not allowed by CORS');
  });

  it('allows requests from configured origins', async () => {
    const res = await supertest(app)
      .get('/test')
      .set('Origin', 'https://allowed.example');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['access-control-allow-origin']).toBe('https://allowed.example');
  });
});
