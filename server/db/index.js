const { Pool } = require('pg');
const logger = require('../services/logger');

const isSupabase = (process.env.DATABASE_URL || '').includes('supabase.co');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: isSupabase || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
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

async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn({ text, duration, rows: result.rowCount }, 'Slow query');
    }
    return result;
  } catch (err) {
    if (isConnectionError(err)) {
      logger.warn({ err: err.message, code: err.code }, 'Query failed with connection error, retrying in 1s');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      if (duration > 1000) {
        logger.warn({ text, duration, rows: result.rowCount }, 'Slow query (retry)');
      }
      return result;
    }
    throw err;
  }
}

module.exports = { pool, query, getPoolStats };
