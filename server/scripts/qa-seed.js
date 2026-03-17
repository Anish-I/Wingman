#!/usr/bin/env node
/**
 * QA Test Seed Script
 * Pre-populates database and Redis with test data for QA testing
 */

const pg = require('pg');
const Redis = require('ioredis');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wingman:wingman@localhost:5432/wingman';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const TEST_PHONE = '+15005550006';
const TEST_OTP = '1234';

async function seed() {
  const client = new pg.Client(DATABASE_URL);
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });

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
      console.log(`✓ Test user already exists: ${TEST_PHONE} (ID: ${userId})`);
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
      console.log(`✓ Created test user: ${TEST_PHONE} (ID: ${userId})`);
    }

    // Store OTP in Redis with 10-minute TTL
    const otpKey = `otp:${TEST_PHONE}`;
    await redis.set(otpKey, TEST_OTP, 'EX', 600);
    console.log(`✓ Stored OTP in Redis: ${otpKey} = ${TEST_OTP} (TTL: 600s)`);

    // Generate JWT token for testing (using hardcoded secret for QA)
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'qa_test_secret_64_character_string_minimum_for_testing_only_12345';
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

    console.log('\n📋 QA Test Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Phone:     ${TEST_PHONE}`);
    console.log(`OTP:       ${TEST_OTP}`);
    console.log(`User ID:   ${userId}`);
    console.log(`Token:     ${token.slice(0, 40)}...`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ QA Seed Complete! You can now:');
    console.log('  1. Navigate to http://localhost:8081');
    console.log(`  2. Enter phone: ${TEST_PHONE}`);
    console.log(`  3. Enter OTP: ${TEST_OTP}`);
    console.log('  4. Continue through onboarding flow\n');

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
