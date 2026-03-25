#!/usr/bin/env node
/**
 * QA Test Seed Script
 * Pre-populates database and Redis with test data for QA testing
 */

const pg = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createRedisClient } = require('../services/redis');

if (process.env.NODE_ENV === 'production') {
  console.error('❌ QA seed script must not run in production.');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required. Set it in your .env file.');
  process.exit(1);
}

const TEST_PHONE = '+15005550006';
const TEST_OTP = '1234';

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
    const crypto = require('crypto');
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

    // Generate JWT token for testing (using hardcoded secret for QA)
    const jwt = require('jsonwebtoken');
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET environment variable is required');
      process.exit(1);
    }
    const JWT_SECRET = process.env.JWT_SECRET;
    const token = jwt.sign(
      { userId, phone: TEST_PHONE },
      JWT_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '24h',
        issuer: 'wingman',
        audience: 'wingman-app',
      }
    );

    console.log('✓ Generated JWT token for test user');

    console.log('\n✅ QA Seed Complete! Test user is ready.');
    console.log('  Phone: %s', TEST_PHONE);
    console.log('  Token: [redacted — stored in variable]');
    console.log('  OTP: [redacted — stored in Redis key %s]', otpKey);

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
