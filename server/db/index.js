const { Pool } = require('pg');

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

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn('Slow query:', { text, duration, rows: result.rowCount });
  }
  return result;
}

module.exports = { pool, query };
