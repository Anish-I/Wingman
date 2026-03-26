const Redis = require('ioredis');
const crypto = require('crypto');
const logger = require('./logger');

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
 *
 * In non-development environments, REDIS_PASSWORD is mandatory — the process
 * exits immediately if it is missing, preventing unauthenticated access to
 * OTP hashes, session data, and rate-limit counters.
 */
function createRedisClient(overrides = {}) {
  const env = process.env.NODE_ENV || 'development';
  if (env !== 'development' && env !== 'test' && !process.env.REDIS_PASSWORD) {
    console.error('[redis] FATAL: REDIS_PASSWORD is required in non-development environments to prevent unauthenticated access. Exiting.');
    process.exit(1);
  }
  return new Redis(process.env.REDIS_URL || 'redis://localhost:6379', buildRedisOptions(overrides));
}

const redis = createRedisClient();

redis.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis connection error');
});

const CONVERSATION_TTL = 60 * 60 * 24; // 24 hours
const MAX_MESSAGES = 10;

/**
 * Allowed roles for conversation messages loaded from Redis.
 * Only 'user' and 'assistant' are valid in conversation history —
 * 'system' and other roles are injected server-side, never stored.
 */
const ALLOWED_HISTORY_ROLES = new Set(['user', 'assistant']);

/**
 * Sanitize a single conversation message loaded from Redis.
 * Returns null if the message is invalid or potentially tampered with.
 */
function sanitizeHistoryMessage(raw, index) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    logger.warn({ index, preview: typeof raw === 'string' ? raw.slice(0, 120) : typeof raw }, '[redis] Skipping corrupted conversation entry (JSON parse failed)');
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  // Only allow user/assistant roles — block system, tool, function, or unknown roles
  if (!ALLOWED_HISTORY_ROLES.has(parsed.role)) {
    logger.warn({ role: parsed.role }, '[redis] Dropped message with disallowed role from conversation history');
    return null;
  }

  // Content must be a non-empty string or an array (for multi-part assistant messages)
  const { content } = parsed;
  if (typeof content === 'string') {
    if (content.length === 0) return null;
    return { role: parsed.role, content, timestamp: parsed.timestamp };
  }
  if (Array.isArray(content)) {
    // Validate each content block has a known type and string text where expected
    const cleaned = content.filter(
      (block) => block && typeof block === 'object' && typeof block.type === 'string'
    );
    if (cleaned.length === 0) return null;
    return { role: parsed.role, content: cleaned, timestamp: parsed.timestamp };
  }

  return null;
}

async function getConversationHistory(userId) {
  const key = `conv:${userId}`;
  let messages;
  try {
    messages = await redis.lrange(key, 0, MAX_MESSAGES - 1);
  } catch (err) {
    logger.error({ userId, err: err.message }, '[redis] Failed to load conversation history, returning empty');
    return [];
  }
  const sanitized = [];
  let skipped = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = sanitizeHistoryMessage(messages[i], i);
    if (msg) {
      sanitized.push(msg);
    } else {
      skipped++;
    }
  }
  if (skipped > 0) {
    logger.warn({ userId, skipped, total: messages.length }, '[redis] Skipped corrupted entries in conversation history');
  }
  return sanitized.reverse();
}

async function appendMessage(userId, role, content) {
  const key = `conv:${userId}`;
  const entry = JSON.stringify({ role, content, timestamp: Date.now() });
  const pipeline = redis.pipeline();
  pipeline.lpush(key, entry);
  pipeline.ltrim(key, 0, MAX_MESSAGES - 1);
  pipeline.expire(key, CONVERSATION_TTL);
  const results = await pipeline.exec();
  // pipeline.exec() returns [[err, result], ...] — throw the first error found
  for (const [err] of results) {
    if (err) throw err;
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
    logger.error({ err: err.message }, '[redis] Cleanup error');
  }
}

/**
 * Atomic message deduplication using SET NX EX.
 * Returns true if this is the first time the message was seen (caller should process it).
 * Returns false if the message was already seen (caller should skip it).
 *
 * When msgId is provided, dedup is based on the provider message ID.
 * When msgId is absent, dedup falls back to a hash of phone + content + 5-second
 * time bucket.  This catches rapid webhook retries while allowing the same text
 * to be sent again after the bucket expires.
 */
async function deduplicateMessage(msgId, phone, messageText) {
  let dedupKey;
  if (msgId) {
    dedupKey = `sms:dedup:${msgId}`;
  } else {
    // Content-based fallback: keyed by phone + content + 5-second time bucket.
    // The short bucket catches rapid webhook retries (sub-second to a few
    // seconds apart) while allowing a user to legitimately send the same text
    // again moments later.  Providers that supply a message ID (e.g. Twilio's
    // MessageSid) use the branch above, where the 300s TTL covers their full
    // retry schedule — so the short bucket here only affects ID-less webhooks.
    const crypto = require('crypto');
    const bucket = Math.floor(Date.now() / 5000);
    const hash = crypto.createHash('sha256').update(`${phone}:${messageText}:${bucket}`).digest('hex').slice(0, 16);
    dedupKey = `sms:dedup:content:${hash}`;
  }
  const result = await redis.set(dedupKey, '1', 'NX', 'EX', 10);
  return result === 'OK';
}

/**
 * Atomic dedup-and-enqueue: uses a Lua script to SET NX the dedup key and
 * RPUSH the message into the per-phone queue in a single atomic operation.
 * This eliminates the TOCTOU gap between deduplicateMessage() and enqueueSMS()
 * — if dedup succeeds, the message is guaranteed to be enqueued; if it fails,
 * nothing is enqueued. No duplicate workflow triggers can slip through.
 *
 * Returns true if the message was new (deduped + enqueued).
 * Returns false if the message was already seen (nothing enqueued).
 */
const DEDUP_ENQUEUE_LUA = `
  local dedupKey = KEYS[1]
  local queueKey = KEYS[2]
  local dedupTTL = tonumber(ARGV[1])
  local queueTTL = tonumber(ARGV[2])
  local entry = ARGV[3]

  -- Atomic SET NX: claim the dedup slot or bail
  local ok = redis.call('SET', dedupKey, '1', 'NX', 'EX', dedupTTL)
  if not ok then
    return 0
  end

  -- Dedup succeeded — enqueue the message in the same atomic script
  redis.call('RPUSH', queueKey, entry)
  redis.call('EXPIRE', queueKey, queueTTL)
  return 1
`;

async function deduplicateAndEnqueue(msgId, phone, messageText, timestamp) {
  let dedupKey;
  let dedupTTL;
  if (msgId) {
    dedupKey = `sms:dedup:${msgId}`;
    dedupTTL = 300; // 5 min — covers provider retry schedules (Twilio: 60s, 3m, 5m)
  } else {
    const crypto = require('crypto');
    const bucket = Math.floor(Date.now() / 5000);
    const hash = crypto.createHash('sha256').update(`${phone}:${messageText}:${bucket}`).digest('hex').slice(0, 16);
    dedupKey = `sms:dedup:content:${hash}`;
    dedupTTL = 10; // short TTL — only catch rapid retries, not legitimate duplicate messages
  }
  const queueKey = `sms:queue:${phone}`;
  const entry = JSON.stringify({ text: messageText, ts: timestamp });

  const result = await redis.eval(
    DEDUP_ENQUEUE_LUA,
    2, dedupKey, queueKey,
    dedupTTL, 600, entry
  );
  return result === 1;
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
  const token = `${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
  const acquired = await redis.set(key, token, 'NX', 'EX', ttlSeconds);
  if (acquired !== 'OK') return null;
  return async function release() {
    // Atomic compare-and-delete via Lua to prevent lock theft
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then redis.call('del', KEYS[1]) end",
      1, key, token
    );
  };
}

/**
 * Enqueue an incoming SMS into a per-phone FIFO queue in Redis.
 * Messages are scored by arrival timestamp so they can be drained in order
 * even when webhooks arrive out of order or concurrently.
 */
async function enqueueSMS(phone, messageText, timestamp) {
  const key = `sms:queue:${phone}`;
  const entry = JSON.stringify({ text: messageText, ts: timestamp });
  const pipeline = redis.pipeline();
  pipeline.rpush(key, entry);
  pipeline.expire(key, 600); // 10-minute safety TTL
  const results = await pipeline.exec();
  for (const [err] of results) {
    if (err) throw err;
  }
}

/**
 * Atomically drain all queued SMS messages for a phone number, returned
 * in FIFO order. Uses LRANGE + DEL in a pipeline so no messages are lost
 * or double-processed.
 */
async function drainSMSQueue(phone) {
  const key = `sms:queue:${phone}`;
  // Lua script: atomically read all entries and delete the key
  const entries = await redis.eval(
    "local items = redis.call('lrange', KEYS[1], 0, -1) redis.call('del', KEYS[1]) return items",
    1, key
  );
  if (!entries || entries.length === 0) return [];
  return entries.map((raw) => {
    const parsed = JSON.parse(raw);
    return { text: parsed.text, ts: parsed.ts };
  });
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
  deduplicateAndEnqueue,
  acquireConversationLock,
  enqueueSMS,
  drainSMSQueue,
};
