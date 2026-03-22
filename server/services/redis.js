const Redis = require('ioredis');

/**
 * Build ioredis options with optional password from REDIS_PASSWORD env var.
 * Callers can override any option by spreading their own after the defaults.
 */
function buildRedisOptions(overrides = {}) {
  const opts = {
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
    ...overrides,
  };
  if (process.env.REDIS_PASSWORD) {
    opts.password = process.env.REDIS_PASSWORD;
  }
  return opts;
}

/**
 * Create an ioredis client using REDIS_URL (with REDIS_PASSWORD when set).
 * All modules should use this instead of instantiating Redis directly.
 */
function createRedisClient(overrides = {}) {
  return new Redis(process.env.REDIS_URL || 'redis://localhost:6379', buildRedisOptions(overrides));
}

const redis = createRedisClient();

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

const CONVERSATION_TTL = 60 * 60 * 24; // 24 hours
const MAX_MESSAGES = 10;

async function getConversationHistory(userId) {
  const key = `conv:${userId}`;
  const messages = await redis.lrange(key, 0, MAX_MESSAGES - 1);
  return messages.map((m) => JSON.parse(m)).reverse();
}

async function appendMessage(userId, role, content) {
  const key = `conv:${userId}`;
  const entry = JSON.stringify({ role, content, timestamp: Date.now() });
  try {
    await redis.lpush(key, entry);
  } finally {
    // Always trim and set TTL, even if lpush partially fails on pipeline
    await redis.ltrim(key, 0, MAX_MESSAGES - 1).catch(() => {});
    await redis.expire(key, CONVERSATION_TTL).catch(() => {});
  }
}

async function setUserSession(token, data, ttl = 3600) {
  const key = `session:${token}`;
  await redis.set(key, JSON.stringify(data), 'EX', ttl);
}

async function getUserSession(token) {
  const key = `session:${token}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

async function deleteSession(token) {
  const key = `session:${token}`;
  await redis.del(key);
}

// NOTE: Configure Redis maxmemory-policy to 'allkeys-lru' or 'volatile-lru' in production
// to handle memory pressure gracefully (redis.conf or CONFIG SET maxmemory-policy).

/**
 * Ensure all conv:* keys have a TTL.
 * Call once on server startup. Scans for conv:* keys and:
 * - If TTL is -1 (no expiry set), applies a 48-hour expiry.
 * - If TTL is -2 (key already expired/gone), skips it.
 * - If TTL is already set, leaves it as-is.
 */
async function cleanupStaleConversations() {
  const STALE_TTL = 48 * 60 * 60; // 48 hours in seconds
  let cursor = '0';
  let cleaned = 0;
  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'conv:*', 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -2) {
          // Key expired or gone between SCAN and TTL check — skip
          continue;
        }
        if (ttl === -1) {
          // No TTL set — apply a 48-hour expiry
          await redis.expire(key, STALE_TTL);
          cleaned++;
        }
      }
    } while (cursor !== '0');
    if (cleaned > 0) console.log(`[redis] Cleanup: set 48h TTL on ${cleaned} stale conversation keys`);
  } catch (err) {
    console.error('[redis] Cleanup error:', err.message);
  }
}

module.exports = {
  redis,
  createRedisClient,
  getConversationHistory,
  appendMessage,
  setUserSession,
  getUserSession,
  deleteSession,
  cleanupStaleConversations,
};
