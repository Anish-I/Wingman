/**
 * Startup validation for critical environment variables.
 * In production (NODE_ENV=production): missing vars cause process.exit(1).
 * In development: missing vars are logged as warnings.
 */

function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const missing = [];

  // Always required
  const required = [
    'JWT_SECRET',
    'OTP_SECRET',
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

  // Require Redis password in production to prevent unauthenticated access
  if (isProduction && !process.env.REDIS_PASSWORD) {
    missing.push('REDIS_PASSWORD');
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

  // Warn if OTP_SECRET and JWT_SECRET are the same — defeats the purpose of separation
  if (otpSecret && jwtSecret && otpSecret === jwtSecret) {
    const msg = 'OTP_SECRET should differ from JWT_SECRET for proper secret isolation';
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
