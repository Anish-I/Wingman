#!/usr/bin/env node
/**
 * QA Test Seed Script
 * Pre-populates database and Redis with test data for QA testing
 */

const crypto = require('crypto');
const pg = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createRedisClient } = require('../services/redis');

const allowedEnvs = ['development', 'test'];
if (!allowedEnvs.includes(process.env.NODE_ENV)) {
  console.error(
    '❌ QA seed script requires NODE_ENV to be "development" or "test" (got: %s).',
    process.env.NODE_ENV || 'undefined'
  );
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required. Set it in your .env file.');
  process.exit(1);
}

// Guard: only allow connections to localhost databases to prevent accidental production seeding
const dbUrl = new URL(DATABASE_URL);
const localHosts = ['localhost', '127.0.0.1', '::1'];
if (!localHosts.includes(dbUrl.hostname)) {
  console.error(
    '❌ QA seed script only allows localhost database connections (got host: %s).\n' +
    '   This prevents accidental seeding of production databases.',
    dbUrl.hostname
  );
  process.exit(1);
}

// Guard: only allow connections to localhost Redis to prevent accidental production seeding
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
try {
  const parsedRedis = new URL(redisUrl);
  if (!localHosts.includes(parsedRedis.hostname)) {
    console.error(
      '❌ QA seed script only allows localhost Redis connections (got host: %s).\n' +
      '   This prevents accidental seeding of production Redis.',
      parsedRedis.hostname
    );
    process.exit(1);
  }
} catch (e) {
  console.error('❌ Failed to parse REDIS_URL: %s', e.message);
  process.exit(1);
}

const TEST_PHONE = '+15005550006';
// Generate a cryptographically random 6-digit OTP matching production format
const TEST_OTP = crypto.randomInt(100000, 1000000).toString();

async function seed() {
  const client = new pg.Client(DATABASE_URL);
  const redis = createRedisClient({ maxRetriesPerRequest: 3 });

  try {
    console.log('🌱 QA Seed Script Started\n');

    // Connect to database
    await client.connect();
    console.log('✓ Connected to PostgreSQL');

    // Check if user already exists
    const existingUser = await client.query(
      'SELECT id, phone, name FROM users WHERE phone = $1',
      [TEST_PHONE]
    );

    let userId;
    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      console.log('✓ Test user already exists');
    } else {
      // Create test user
      const createUserQuery = `
        INSERT INTO users (phone, name, preferences, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        RETURNING id;
      `;

      const result = await client.query(createUserQuery, [
        TEST_PHONE,
        'QA Test User',
        JSON.stringify({ onboarded: true }),
      ]);

      userId = result.rows[0].id;
      console.log('✓ Created test user');
    }

    // Store HMAC-hashed OTP in Redis (matches auth.js verify-otp format)
    if (!process.env.OTP_SECRET) {
      console.error('❌ OTP_SECRET environment variable is required');
      process.exit(1);
    }
    const otpHash = crypto.createHmac('sha256', process.env.OTP_SECRET).update(TEST_OTP).digest('hex');
    const otpRequestId = crypto.randomUUID();
    const otpKey = `otp:${TEST_PHONE}`;
    const otpValue = JSON.stringify({ hash: otpHash, requester: String(userId), requestId: otpRequestId });
    await redis.set(otpKey, otpValue, 'EX', 600);
    console.log('✓ Stored HMAC-hashed OTP in Redis for test user (TTL: 600s)');

    console.log('\n✅ QA Seed Complete! Test user is ready.');
    console.log('  Phone: %s', TEST_PHONE);
    console.log('  OTP: %s (stored HMAC-hashed in Redis key %s)', TEST_OTP, otpKey);
    console.log('  Request ID: %s', otpRequestId);
    console.log('  To obtain a JWT, POST /auth/verify-otp with phone, code, and otp_request_id.');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed Error:', err);
    process.exit(1);
  } finally {
    await client.end();
    redis.disconnect();
  }
}

seed();
