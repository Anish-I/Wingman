const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
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
  return messages.map((m) => JSON.parse(m));
}

async function appendMessage(userId, role, content) {
  const key = `conv:${userId}`;
  const entry = JSON.stringify({ role, content, timestamp: Date.now() });
  await redis.lpush(key, entry);
  await redis.ltrim(key, 0, MAX_MESSAGES - 1);
  await redis.expire(key, CONVERSATION_TTL);
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

module.exports = {
  redis,
  getConversationHistory,
  appendMessage,
  setUserSession,
  getUserSession,
  deleteSession,
};
