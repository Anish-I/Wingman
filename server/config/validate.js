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
    'DATABASE_URL',
    'REDIS_URL',
    'COMPOSIO_API_KEY',
  ];

  for (const key of required) {
    if (!process.env[key] || process.env[key].trim() === '') {
      missing.push(key);
    }
  }

  // At least one SMS provider must be configured
  const hasTelnyx = process.env.TELNYX_API_KEY && process.env.TELNYX_API_KEY.trim() !== '';
  const hasTelnyxPhone = process.env.TELNYX_PHONE_NUMBER && process.env.TELNYX_PHONE_NUMBER.trim() !== '';
  const hasTwilio = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.trim() !== '';
  const isStub = (process.env.MESSAGING_PROVIDER || '').toLowerCase() === 'stub';

  if (!hasTelnyx && !hasTelnyxPhone && !hasTwilio && !isStub) {
    missing.push('TELNYX_API_KEY or TELNYX_PHONE_NUMBER (no SMS provider configured)');
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
