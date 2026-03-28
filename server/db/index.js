const { Pool } = require('pg');
const logger = require('../services/logger');

function isLocalhost(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function buildSslConfig() {
  const dbUrl = process.env.DATABASE_URL || '';

  // Explicit override: DATABASE_SSL=false disables SSL (e.g. local dev)
  if (process.env.DATABASE_SSL === 'false') return false;

  // Skip SSL only for localhost connections with no explicit opt-in
  if (isLocalhost(dbUrl) && process.env.DATABASE_SSL == null) return false;

  // All remote connections use SSL by default
  const sslConfig = { rejectUnauthorized: true };
  if (process.env.DATABASE_CA_CERT) {
    sslConfig.ca = process.env.DATABASE_CA_CERT;
  }
  return sslConfig;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: buildSslConfig(),
});

// Pool event handlers for monitoring and reconnection
pool.on('error', (err) => {
  logger.error({ err: err.message, code: err.code }, 'Unexpected database pool error');
});

pool.on('connect', (client) => {
  logger.debug('New database client connected');
});

pool.on('remove', () => {
  logger.debug('Database client removed from pool');
});

/**
 * Returns current pool statistics for monitoring/health checks.
 */
function getPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

// Connection error codes that warrant a retry
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT',
  'CONNECTION_LOST', '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
]);

function isConnectionError(err) {
  if (!err) return false;
  if (CONNECTION_ERROR_CODES.has(err.code)) return true;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('connection terminated') ||
    msg.includes('connection refused') ||
    msg.includes('connection reset') ||
    msg.includes('timeout');
}

// --- Circuit breaker ---
const CIRCUIT_BREAKER_THRESHOLD = 5;   // failures before opening
const CIRCUIT_BREAKER_RESET_MS = 30000; // 30s before half-open probe

const circuitBreaker = {
  failures: 0,
  state: 'closed',       // closed | open | half-open
  openedAt: 0,
};

function recordSuccess() {
  circuitBreaker.failures = 0;
  circuitBreaker.state = 'closed';
}

function recordFailure() {
  circuitBreaker.failures++;
  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.state = 'open';
    circuitBreaker.openedAt = Date.now();
    logger.error({ failures: circuitBreaker.failures }, 'Circuit breaker OPEN — database connections failing');
  }
}

function assertCircuit() {
  if (circuitBreaker.state === 'open') {
    if (Date.now() - circuitBreaker.openedAt >= CIRCUIT_BREAKER_RESET_MS) {
      circuitBreaker.state = 'half-open';
      logger.info('Circuit breaker half-open — allowing probe query');
    } else {
      const err = new Error('Circuit breaker is open — database unavailable');
      err.code = 'CIRCUIT_OPEN';
      throw err;
    }
  }
}

// --- Retry with exponential backoff ---
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 500;  // 500, 1000, 2000, 4000

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryOnConnectionError(operation, label) {
  assertCircuit();
  try {
    const result = await operation();
    recordSuccess();
    return result;
  } catch (err) {
    if (!isConnectionError(err)) throw err;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { err: err.message, code: err.code, attempt, maxRetries: MAX_RETRIES, delayMs: delay },
        `${label} connection error, retrying in ${delay}ms`,
      );
      await sleep(delay);

      assertCircuit();
      try {
        const result = await operation();
        recordSuccess();
        return result;
      } catch (retryErr) {
        if (!isConnectionError(retryErr)) throw retryErr;
        recordFailure();
        err = retryErr; // keep latest error for final throw
      }
    }

    throw err;
  }
}

async function query(text, params) {
  const start = Date.now();
  const result = await retryOnConnectionError(() => pool.query(text, params), 'query()');
  const duration = Date.now() - start;
  if (duration > 1000) {
    logger.warn({ text, duration, rows: result.rowCount }, 'Slow query');
  }
  return result;
}

/**
 * Executes `fn(txQuery)` inside a single database transaction.
 * `txQuery` has the same signature as `query` but runs on the
 * checked-out client so every statement shares the transaction.
 */
async function withTransaction(fn) {
  const client = await retryOnConnectionError(() => pool.connect(), 'withTransaction()');
  try {
    await client.query('BEGIN');
    const txQuery = async (text, params) => {
      return await client.query(text, params);
    };
    const result = await fn(txQuery);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr.message }, 'ROLLBACK failed after transaction error');
    }
    throw err;
  } finally {
    client.release();
  }
}

function getCircuitBreakerState() {
  return { state: circuitBreaker.state, failures: circuitBreaker.failures };
}

module.exports = { pool, query, getPoolStats, withTransaction, getCircuitBreakerState };
