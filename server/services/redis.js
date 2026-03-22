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

/**
 * Atomic message deduplication using SET NX EX.
 * Returns true if this is the first time the message was seen (caller should process it).
 * Returns false if the message was already seen (caller should skip it).
 *
 * When msgId is provided, dedup is based on the provider message ID.
 * When msgId is absent, dedup falls back to a hash of phone + message content
 * bucketed into 5-second windows to catch replays without a message ID.
 */
async function deduplicateMessage(msgId, phone, messageText) {
  let dedupKey;
  if (msgId) {
    dedupKey = `sms:dedup:${msgId}`;
  } else {
    // Content-based fallback: bucket by 5-second window
    const crypto = require('crypto');
    const bucket = Math.floor(Date.now() / 5000);
    const hash = crypto.createHash('sha256').update(`${phone}:${messageText}:${bucket}`).digest('hex').slice(0, 16);
    dedupKey = `sms:dedup:content:${hash}`;
  }
  const result = await redis.set(dedupKey, '1', 'NX', 'EX', 300);
  return result === 'OK';
}

/**
 * Per-user conversation lock using Redis SET NX EX.
 * Prevents concurrent requests for the same user from interleaving
 * history reads, LLM calls, and message appends.
 *
 * Returns a release function on success, or null if the lock is held.
 */
async function acquireConversationLock(userId, ttlSeconds = 120) {
  const key = `conv:lock:${userId}`;
  const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const acquired = await redis.set(key, token, 'NX', 'EX', ttlSeconds);
  if (acquired !== 'OK') return null;
  return async function release() {
    // Only release if we still hold the lock (compare token)
    const current = await redis.get(key);
    if (current === token) await redis.del(key);
  };
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
  deduplicateMessage,
  acquireConversationLock,
};
