require('dotenv').config();

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

// Security headers
app.use(helmet());

// CORS — require CORS_ORIGIN in production
const corsOrigin = process.env.CORS_ORIGIN;
if (process.env.NODE_ENV === 'production' && !corsOrigin) {
  console.error('FATAL: CORS_ORIGIN must be set in production');
  process.exit(1);
}
app.use(cors({
  origin: corsOrigin || 'http://localhost:3000',
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
