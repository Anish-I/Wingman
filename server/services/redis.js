const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required by BullMQ
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

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
 * Cleanup stale conversation keys older than 48 hours.
 * Call once on server startup. Scans for conv:* keys with no TTL
 * or TTL > 48h and deletes them.
 */
async function cleanupStaleConversations() {
  const MAX_AGE = 48 * 60 * 60; // 48 hours in seconds
  let cursor = '0';
  let cleaned = 0;
  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'conv:*', 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        const ttl = await redis.ttl(key);
        // ttl = -1 means no expiry set, ttl = -2 means key doesn't exist
        if (ttl === -1) {
          // No TTL set — apply the standard TTL
          await redis.expire(key, CONVERSATION_TTL);
          cleaned++;
        }
      }
    } while (cursor !== '0');
    if (cleaned > 0) console.log(`[redis] Cleanup: set TTL on ${cleaned} stale conversation keys`);
  } catch (err) {
    console.error('[redis] Cleanup error:', err.message);
  }
}

module.exports = {
  redis,
  getConversationHistory,
  appendMessage,
  setUserSession,
  getUserSession,
  deleteSession,
  cleanupStaleConversations,
};
