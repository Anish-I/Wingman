require('dotenv').config();

// Debug: Log environment status
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET not loaded from .env');
  process.exit(1);
}

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
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS — allow Expo web dev ports + env-configurable production origin
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:8082',
  process.env.CORS_ORIGIN,
].filter(Boolean);

if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.error('FATAL: CORS_ORIGIN must be set in production');
  process.exit(1);
}
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
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
  message: { error: 'Too many requests, please try again later.' },
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

// Start workflow worker (BullMQ consumer)
// Catch unhandled rejections from BullMQ Redis version check gracefully
process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  if (msg.includes('Redis version') || msg.includes('maxRetriesPerRequest')) {
    console.warn('[workflow-worker] BullMQ skipped — Redis >=5.0 required (local dev fallback)');
  } else {
    console.error('[server] Unhandled rejection:', msg);
  }
});

try {
  require('./workers/workflow-worker');
  console.log('[server] Workflow worker started');
} catch (err) {
  console.warn('[server] Workflow worker failed to start:', err.message);
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler middleware — never leak stack traces or internal details
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Wingman server running on port ${PORT}`);
});

// Listen for unhandled errors after startup
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  const msg = reason?.message || String(reason);
  // Ignore known BullMQ/Redis version issues
  if (!msg.includes('Redis version') && !msg.includes('maxRetriesPerRequest')) {
    console.error('[FATAL] Unhandled rejection:', msg);
    console.error(reason);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
