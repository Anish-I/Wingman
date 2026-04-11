require('dotenv').config();

// Global error traps — capture startup and runtime crashes with detailed logging
process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err);
  const code = err?.code || '';
  // Use error code instead of fragile string matching on message text.
  // ECONNREFUSED from Redis/Postgres is transient and non-fatal.
  const isExpected = code === 'ECONNREFUSED' || code === 'ECONNRESET';
  
  // Use pino logger if available, fall back to console for very early errors
  const log = (() => { try { return require('./services/logger'); } catch { return console; } })();
  const level = isExpected ? 'warn' : 'fatal';
  log[level]({
    type: 'uncaughtException',
    message: msg,
    code: err.code,
    errno: err.errno,
    // stack trace omitted — avoids leaking internal paths via log aggregation
    expected: isExpected,
  }, `Uncaught exception: ${msg}`);
  
  if (!isExpected) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  // BullMQ emits Redis version check rejections in envs without Redis >=5.0
  if (msg.includes('Redis version') || msg.includes('maxRetriesPerRequest')) {
    console.warn('[workflow-worker] BullMQ skipped — Redis >=5.0 required (local dev fallback)');
    return;
  }

  console.error('[crash-log]', JSON.stringify({
    type: 'unhandledRejection',
    message: msg,
    reason: String(reason),
    timestamp: new Date().toISOString(),
  }));
});

// Validate critical environment variables on startup
const { validateEnv } = require('./config/validate');
validateEnv();

const logger = require('./services/logger');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { createCorsOptions } = require('./config/cors');

const smsRoutes = require('./routes/sms');
const authRoutes = require('./routes/auth');
const connectRoutes = require('./routes/connect');
const stubSmsRoutes = require('./routes/stub-sms');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy headers (required for Cloudflare Tunnel / reverse proxies)
// Only enable when explicitly configured — prevents X-Forwarded-For spoofing
// in environments without a real reverse proxy.
// TRUST_PROXY values: 'loopback' (recommended), number of hops, comma-separated subnets, or 'true'
if (process.env.TRUST_PROXY) {
  const val = process.env.TRUST_PROXY;
  const parsed = /^\d+$/.test(val) ? parseInt(val, 10) : val;
  app.set('trust proxy', parsed);
}

// Redirect HTTP to HTTPS when running behind a TLS-terminating proxy.
// Enabled automatically in production, or explicitly via FORCE_HTTPS=true.
// Requires TRUST_PROXY so X-Forwarded-Proto is reliable.
if (process.env.NODE_ENV === 'production' || process.env.FORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }
    // Skip health/ready endpoints so load-balancer probes over HTTP still work
    if (req.path === '/health' || req.path === '/ready') {
      return next();
    }
    const host = req.headers.host;
    if (!host) {
      return res.status(400).end();
    }
    res.redirect(301, `https://${host}${req.url}`);
  });
}

// Security headers with explicit Content-Security-Policy
// HSTS tells browsers to always use HTTPS for future requests (1 year, includeSubDomains)
const isHttpsEnforced = process.env.NODE_ENV === 'production' || process.env.FORCE_HTTPS === 'true';
app.use(helmet({
  hsts: isHttpsEnforced
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://logos.composio.dev"],
      connectSrc: [
        "'self'",
        "https://accounts.google.com",
        "https://appleid.apple.com",
      ],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://appleid.apple.com"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      // Only upgrade insecure requests when HTTPS is enforced — avoids
      // breaking local HTTP dev (localhost:3001 → HTTPS would fail).
      ...(isHttpsEnforced ? { upgradeInsecureRequests: [] } : {}),
    },
  },
}));

// Permissions-Policy: restrict browser features the API server doesn't need.
// Denies camera, microphone, geolocation, and payment to all contexts.
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

// CORS — only allow explicitly configured CORS_ORIGIN in all environments.
// Previously, non-production added a broad localhost allowlist which could be
// exploited when the server was exposed via tunnels (ngrok, Cloudflare Tunnel).
// Developers must set CORS_ORIGIN in their .env (e.g. http://localhost:8081).
if (!process.env.CORS_ORIGIN) {
  console.error('FATAL: CORS_ORIGIN must be set');
  process.exit(1);
}
const allowedOrigins = process.env.CORS_ORIGIN
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.error('FATAL: CORS_ORIGIN must include at least one valid origin');
  process.exit(1);
}

app.use(cors(createCorsOptions(allowedOrigins)));

// Cookie parsing (required for OAuth session binding)
app.use(cookieParser());

// Global rate limit: 100 requests per 15 minutes
// Must precede body parsing to reject floods before consuming parse CPU/memory
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.' } },
});
app.use(globalLimiter);

// Body parsing with size limits
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buf) => {
    // Preserve raw body for signature verification (Telnyx webhooks, SMS routes)
    if (req.originalUrl && (req.originalUrl.startsWith('/webhook') || req.originalUrl.startsWith('/sms'))) {
      req.rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Routes
app.use('/webhook', smsRoutes);
app.use('/auth', authRoutes);
app.use('/connect', connectRoutes);
app.use('/api', require('./routes/api'));

// Mount stub SMS routes only in non-production environments with stub provider
const msgProvider = (process.env.MESSAGING_PROVIDER || '').toLowerCase();
if ((msgProvider === 'stub' || !process.env.TELNYX_API_KEY) && process.env.NODE_ENV !== 'production') {
  app.use('/stub', stubSmsRoutes);
  console.log('[server] Stub SMS routes mounted at /stub (dev only)');
}

// Add route for root URL
app.get('/', (req, res) => {
  res.json({ message: 'Wingman server is running' });
});

// Health check with dependency verification
async function checkDependencies() {
  const results = { postgres: { ok: false, latencyMs: null }, redis: { ok: false, latencyMs: null } };

  // Check PostgreSQL
  try {
    const pgStart = Date.now();
    const { pool } = require('./db');
    await pool.query('SELECT 1');
    results.postgres = { ok: true, latencyMs: Date.now() - pgStart };
  } catch (err) {
    logger.error({ err }, 'Health check: PostgreSQL unreachable');
    results.postgres = { ok: false, latencyMs: null, error: 'unavailable' };
  }

  // Check Redis
  try {
    const redisStart = Date.now();
    const { redis } = require('./services/redis');
    await redis.ping();
    results.redis = { ok: true, latencyMs: Date.now() - redisStart };
  } catch (err) {
    logger.error({ err }, 'Health check: Redis unreachable');
    results.redis = { ok: false, latencyMs: null, error: 'unavailable' };
  }

  const allOk = results.postgres.ok && results.redis.ok;
  return { status: allOk ? 'ok' : 'degraded', ...results, uptime: process.uptime() };
}

// Liveness probe: returns 200 if the process is alive, regardless of
// dependency health.  Returning 503 here would cause container orchestrators
// (Kubernetes, ECS) to restart the pod on transient Redis/Postgres blips,
// turning a brief outage into a cascading restart storm.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Readiness probe: returns 200 only when all dependencies (Postgres, Redis)
// are reachable.  A 503 tells the load balancer to stop routing traffic to
// this instance until dependencies recover — without restarting the process.
app.get('/ready', async (req, res) => {
  const health = await checkDependencies();
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// Error handler middleware — never leak stack traces or internal details
app.use((err, req, res, _next) => {
  logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  const status = err.status || 500;
  const code = status === 401 ? 'AUTH_ERROR'
    : status === 403 ? 'FORBIDDEN'
    : status === 400 ? 'VALIDATION_ERROR'
    : 'UNKNOWN_ERROR';
  res.status(status).json({ error: { code, message: 'An unexpected error occurred.' } });
});

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Wingman server running');

  // HTTP server timeout hardening — prevents slowloris and slow-body attacks.
  // headersTimeout: max time to receive complete request headers (rejects slow/stuck connections)
  // requestTimeout: max time for the entire request including body (prevents slow-POST attacks)
  // timeout: overall socket inactivity timeout (kills truly idle connections)
  // keepAliveTimeout: idle time before closing a keep-alive connection (must be < headersTimeout)
  //
  // requestTimeout and timeout accommodate the 120s PROCESS_MESSAGE_TIMEOUT in the
  // orchestrator plus overhead for body parsing and response serialization.
  server.headersTimeout = 30_000;       // 30s — well above normal header delivery
  server.requestTimeout = 180_000;      // 180s — covers 120s orchestrator + overhead
  server.timeout = 180_000;             // 180s — overall socket inactivity
  server.keepAliveTimeout = 20_000;     // 20s — connection reuse window (must be < headersTimeout)

  // Cleanup stale Redis conversation keys on startup
  const { cleanupStaleConversations } = require('./services/redis');
  cleanupStaleConversations().catch(err => logger.error({ err: err.message }, 'Startup conversation cleanup failed'));

  // Purge expired token blacklist entries from PostgreSQL on startup and every hour
  const { purgeExpiredBlacklistEntries } = require('./db/queries');
  purgeExpiredBlacklistEntries().catch(err => logger.error({ err: err.message }, 'Startup blacklist purge failed'));
  setInterval(() => {
    purgeExpiredBlacklistEntries().catch(err => logger.error({ err: err.message }, 'Periodic blacklist purge failed'));
  }, 60 * 60 * 1000);

  // Start BullMQ workers only after server is listening so jobs that call
  // back into HTTP routes or depend on fully-initialized services don't fail.
  try {
    const { startWorker } = require('./workers/workflow-worker');
    startWorker()
      .then(() => logger.info('[server] Workflow worker started'))
      .catch(err => logger.warn({ err: err.message }, '[server] Workflow worker failed to start'));
  } catch (err) {
    logger.warn({ err: err.message }, '[server] Workflow worker failed to load');
  }
});

// uncaughtException and unhandledRejection handlers are registered at module init (top of file)

// Graceful shutdown
async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully...`);

  // Force-exit after 15 seconds if graceful shutdown stalls
  const forceTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 15s, forcing exit');
    process.exit(1);
  }, 15_000);
  forceTimer.unref();

  // 1. Stop accepting new connections and wait for in-flight requests to finish
  await new Promise((resolve) => {
    server.close(() => {
      logger.info('HTTP server closed.');
      resolve();
    });
  });

  try {
    // 1b. Drain in-flight memory extractions so user preferences aren't lost
    const { drainPendingMemory } = require('./services/orchestrator');
    await drainPendingMemory(8000);
    logger.info('Pending memory extractions drained.');
  } catch (err) {
    logger.warn({ err: err.message }, 'Error draining memory extractions');
  }

  try {
    // 2. Close Redis connection
    const { redis } = require('./services/redis');
    await redis.quit();
    logger.info('Redis connection closed.');
  } catch (err) {
    logger.warn({ err: err.message }, 'Error closing Redis connection');
  }

  try {
    // 3. Drain the DB connection pool
    const { pool } = require('./db');
    await pool.end();
    logger.info('Database pool closed.');
  } catch (err) {
    logger.warn({ err: err.message }, 'Error closing database pool');
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
