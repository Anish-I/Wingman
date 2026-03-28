/**
 * Startup validation for critical environment variables.
 * In production (NODE_ENV=production): missing vars cause process.exit(1).
 * In development: missing vars are logged as warnings.
 */

function validateEnv() {
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase().trim();
  const isProduction = nodeEnv === 'production' || nodeEnv === 'prod';
  const missing = [];

  // Always required
  const required = [
    'JWT_SECRET',
    'OTP_SECRET',
    'OAUTH_STATE_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'COMPOSIO_API_KEY',
  ];

  for (const key of required) {
    if (!process.env[key] || process.env[key].trim() === '') {
      missing.push(key);
    }
  }

  // At least one COMPLETE SMS provider must be configured.
  // Partial configs (e.g. API key without phone number) are treated as invalid.
  const hasTelnyxKey = process.env.TELNYX_API_KEY && process.env.TELNYX_API_KEY.trim() !== '';
  const hasTelnyxPhone = process.env.TELNYX_PHONE_NUMBER && process.env.TELNYX_PHONE_NUMBER.trim() !== '';
  const hasTwilioSid = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.trim() !== '';
  const hasTwilioToken = process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_AUTH_TOKEN.trim() !== '';
  const isStub = (process.env.MESSAGING_PROVIDER || '').toLowerCase() === 'stub';

  const telnyxComplete = hasTelnyxKey && hasTelnyxPhone;
  const twilioComplete = hasTwilioSid && hasTwilioToken;

  // Warn about partial configs (likely misconfiguration)
  if (hasTelnyxKey && !hasTelnyxPhone) {
    console.warn('[env-validate] WARN: TELNYX_API_KEY is set but TELNYX_PHONE_NUMBER is missing — Telnyx provider is incomplete.');
  }
  if (!hasTelnyxKey && hasTelnyxPhone) {
    console.warn('[env-validate] WARN: TELNYX_PHONE_NUMBER is set but TELNYX_API_KEY is missing — Telnyx provider is incomplete.');
  }
  if (hasTwilioSid && !hasTwilioToken) {
    console.warn('[env-validate] WARN: TWILIO_ACCOUNT_SID is set but TWILIO_AUTH_TOKEN is missing — Twilio provider is incomplete.');
  }
  if (!hasTwilioSid && hasTwilioToken) {
    console.warn('[env-validate] WARN: TWILIO_AUTH_TOKEN is set but TWILIO_ACCOUNT_SID is missing — Twilio provider is incomplete.');
  }

  if (!telnyxComplete && !twilioComplete && !isStub) {
    missing.push('Complete SMS provider (TELNYX_API_KEY + TELNYX_PHONE_NUMBER, or TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN)');
  }

  // Require Redis password in all non-local environments (production, staging, etc.)
  // This is a hard exit — not deferred to the general missing-vars check — because
  // an unauthenticated Redis exposes cached OTPs, sessions, and rate-limit data.
  const isLocal = !process.env.NODE_ENV || nodeEnv === 'development' || nodeEnv === 'test';
  if (!isLocal && !process.env.REDIS_PASSWORD) {
    console.error('[env-validate] FATAL: REDIS_PASSWORD is required in non-development environments to prevent unauthenticated access to OTPs, sessions, and rate-limit data. Exiting.');
    process.exit(1);
  }

  // Enforce minimum length for JWT_SECRET to prevent brute-force token forgery
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret && jwtSecret.length < 32) {
    const msg = 'JWT_SECRET must be at least 32 characters long to prevent brute-force token forgery';
    if (isProduction) {
      console.error(`[env-validate] ERROR: ${msg}`);
      process.exit(1);
    } else {
      console.warn(`[env-validate] WARN: ${msg}`);
    }
  }

  // Enforce minimum length for OTP_SECRET to prevent brute-force OTP precomputation
  const otpSecret = process.env.OTP_SECRET;
  if (otpSecret && otpSecret.length < 32) {
    const msg = 'OTP_SECRET must be at least 32 characters long to prevent OTP precomputation attacks';
    if (isProduction) {
      console.error(`[env-validate] ERROR: ${msg}`);
      process.exit(1);
    } else {
      console.warn(`[env-validate] WARN: ${msg}`);
    }
  }

  // Enforce minimum length for OAUTH_STATE_SECRET
  const oauthStateSecret = process.env.OAUTH_STATE_SECRET;
  if (oauthStateSecret && oauthStateSecret.length < 32) {
    const msg = 'OAUTH_STATE_SECRET must be at least 32 characters long to prevent brute-force state forgery';
    if (isProduction) {
      console.error(`[env-validate] ERROR: ${msg}`);
      process.exit(1);
    } else {
      console.warn(`[env-validate] WARN: ${msg}`);
    }
  }

  // Warn if OTP_SECRET and JWT_SECRET are the same — defeats the purpose of separation
  if (otpSecret && jwtSecret && otpSecret === jwtSecret) {
    const msg = 'OTP_SECRET should differ from JWT_SECRET for proper secret isolation';
    console.warn(`[env-validate] WARN: ${msg}`);
  }

  // Warn if OAUTH_STATE_SECRET reuses JWT_SECRET — defeats domain separation
  if (oauthStateSecret && jwtSecret && oauthStateSecret === jwtSecret) {
    const msg = 'OAUTH_STATE_SECRET should differ from JWT_SECRET for proper secret isolation';
    console.warn(`[env-validate] WARN: ${msg}`);
  }

  if (missing.length === 0) {
    return; // All good
  }

  const label = isProduction ? 'ERROR' : 'WARN';
  for (const key of missing) {
    console.error(`[env-validate] ${label}: Missing critical env var — ${key}`);
  }

  if (isProduction) {
    console.error('[env-validate] Exiting: critical environment variables are missing in production.');
    process.exit(1);
  } else {
    console.warn('[env-validate] Continuing in development mode despite missing env vars.');
  }
}

module.exports = { validateEnv };
