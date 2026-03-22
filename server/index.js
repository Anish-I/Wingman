require('dotenv').config();

// Global error traps — capture startup and runtime crashes with detailed logging
process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err);
  const isExpected = msg.includes('ECONNREFUSED') || msg.includes('Redis');
  
  // Use pino logger if available, fall back to console for very early errors
  const log = (() => { try { return require('./services/logger'); } catch { return console; } })();
  const level = isExpected ? 'warn' : 'fatal';
  log[level]({
    type: 'uncaughtException',
    message: msg,
    code: err.code,
    errno: err.errno,
    stack: err.stack?.split('\n').slice(0, 5).join('\n'),
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

// Security headers
app.use(helmet());

// CORS — in production only allow CORS_ORIGIN; in dev also allow localhost
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  ...(process.env.NODE_ENV !== 'production' ? [
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:8098',
    'http://127.0.0.1:8098',
    'http://localhost:19006',
    'http://127.0.0.1:19006',
  ] : []),
].filter(Boolean);

if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.error('FATAL: CORS_ORIGIN must be set in production');
  process.exit(1);
}
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Body parsing with size limits
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Global rate limit: 100 requests per 15 minutes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.' } },
});
app.use(globalLimiter);

// Routes
app.use('/webhook', smsRoutes);
app.use('/auth', authRoutes);
app.use('/connect', connectRoutes);
app.use('/api', require('./routes/api'));

// Mount stub SMS routes when using stub provider
const msgProvider = (process.env.MESSAGING_PROVIDER || '').toLowerCase();
if (msgProvider === 'stub' || !process.env.TELNYX_API_KEY) {
  app.use('/stub', stubSmsRoutes);
  console.log('[server] Stub SMS routes mounted at /stub');
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
    results.postgres = { ok: false, latencyMs: null, error: err.message };
  }

  // Check Redis
  try {
    const redisStart = Date.now();
    const { redis } = require('./services/redis');
    await redis.ping();
    results.redis = { ok: true, latencyMs: Date.now() - redisStart };
  } catch (err) {
    results.redis = { ok: false, latencyMs: null, error: err.message };
  }

  const allOk = results.postgres.ok && results.redis.ok;
  return { status: allOk ? 'ok' : 'degraded', ...results, uptime: process.uptime() };
}

app.get('/health', async (req, res) => {
  const health = await checkDependencies();
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

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

  // Cleanup stale Redis conversation keys on startup
  const { cleanupStaleConversations } = require('./services/redis');
  cleanupStaleConversations().catch(err => logger.error({ err: err.message }, 'Startup conversation cleanup failed'));

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
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});
