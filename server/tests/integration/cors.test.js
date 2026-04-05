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

  it('rejects requests without an Origin header', async () => {
    const res = await supertest(app).get('/test');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Origin header required');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
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
