'use strict';

const { EventEmitter } = require('events');
const Redis = require('ioredis');

class StubProvider extends EventEmitter {
  constructor() {
    super();
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });
    this.redis.on('error', (err) => {
      console.error('[stub] Redis error:', err.message);
    });
  }

  async sendMessage(to, body) {
    const id = `stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = {
      from: process.env.TELNYX_PHONE || '+15550000000',
      to,
      body,
      timestamp: Date.now(),
      id,
    };

    // Store in Redis list
    const key = `stub:messages:${to}`;
    await this.redis.rpush(key, JSON.stringify(message));
    await this.redis.expire(key, 86400); // 24h TTL

    console.log(`[STUB SMS → ${to}]: ${body}`);
    this.emit('message', message);
    return { id };
  }

  validateIncoming(rawBody, headers) {
    return true;
  }

  parseIncoming(payload) {
    // When testing via stub, payload is already { from, body, messageId }
    return payload;
  }

  async getMessages(phone) {
    const key = `stub:messages:${phone}`;
    const messages = await this.redis.lrange(key, 0, -1);
    return messages.map((m) => JSON.parse(m));
  }
}

module.exports = StubProvider;
