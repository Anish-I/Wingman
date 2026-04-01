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

  // Enforce minimum length for secrets in ALL environments — short secrets are
  // never acceptable, even in development, because they allow trivial brute-force.
  const jwtSecrets = process.env.JWT_SECRETS;
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecrets) {
    try {
      const parsed = JSON.parse(jwtSecrets);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        console.error('[env-validate] FATAL: JWT_SECRETS must be a non-empty JSON array of {kid, secret} objects');
        process.exit(1);
      }
      for (const entry of parsed) {
        if (!entry.kid || typeof entry.kid !== 'string') {
          console.error('[env-validate] FATAL: Each JWT_SECRETS entry must have a string "kid" field');
          process.exit(1);
        }
        if (!entry.secret || typeof entry.secret !== 'string' || entry.secret.length < 64) {
          console.error(`[env-validate] FATAL: JWT_SECRETS entry "${entry.kid}" must have a "secret" of at least 64 characters`);
          process.exit(1);
        }
      }
    } catch (err) {
      if (err.name === 'SyntaxError') {
        console.error('[env-validate] FATAL: JWT_SECRETS is not valid JSON');
        process.exit(1);
      }
    }
  } else if (jwtSecret && jwtSecret.length < 64) {
    console.error('[env-validate] FATAL: JWT_SECRET must be at least 64 characters long to prevent brute-force token forgery');
    process.exit(1);
  }

  const otpSecret = process.env.OTP_SECRET;
  if (otpSecret && otpSecret.length < 32) {
    console.error('[env-validate] FATAL: OTP_SECRET must be at least 32 characters long to prevent OTP precomputation attacks');
    process.exit(1);
  }

  const oauthStateSecret = process.env.OAUTH_STATE_SECRET;
  if (oauthStateSecret && oauthStateSecret.length < 32) {
    console.error('[env-validate] FATAL: OAUTH_STATE_SECRET must be at least 32 characters long to prevent brute-force state forgery');
    process.exit(1);
  }

  // Warn if OTP_SECRET and JWT_SECRET(s) are the same — defeats the purpose of separation
  const jwtSecretValues = jwtSecrets
    ? (() => { try { return JSON.parse(jwtSecrets).map((e) => e.secret); } catch { return []; } })()
    : (jwtSecret ? [jwtSecret] : []);
  for (const s of jwtSecretValues) {
    if (otpSecret && s && otpSecret === s) {
      console.warn('[env-validate] WARN: OTP_SECRET should differ from JWT signing secrets for proper secret isolation');
      break;
    }
  }
  for (const s of jwtSecretValues) {
    if (oauthStateSecret && s && oauthStateSecret === s) {
      console.warn('[env-validate] WARN: OAUTH_STATE_SECRET should differ from JWT signing secrets for proper secret isolation');
      break;
    }
  }

  // In production, Google/Apple OAuth vars are required — without them OAuth login fails at runtime.
  // APPLE_CLIENT_ID is especially critical: if unset, Apple JWT verification would accept tokens
  // with any audience claim, meaning a token from a different app could pass as valid.
  if (isProduction) {
    if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.trim() === '') {
      missing.push('GOOGLE_CLIENT_ID');
    }
    if (!process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET.trim() === '') {
      missing.push('GOOGLE_CLIENT_SECRET');
    }
    if (!process.env.APPLE_CLIENT_ID || process.env.APPLE_CLIENT_ID.trim() === '') {
      missing.push('APPLE_CLIENT_ID');
    }
  } else if (!process.env.APPLE_CLIENT_ID || process.env.APPLE_CLIENT_ID.trim() === '') {
    console.warn('[env-validate] WARN: APPLE_CLIENT_ID is not set — Apple sign-in will reject all tokens at runtime.');
  }

  // At least one LLM provider API key must be set — without one, chat is completely broken.
  // Check the configured primary provider first, then any fallback.
  const llmProvider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const llmKeyMap = {
    gemini: 'GEMINI_API_KEY',
    together: 'TOGETHER_API_KEY',
    groq: 'GROQ_API_KEY',
  };
  const primaryKey = llmKeyMap[llmProvider];
  const hasPrimaryLLM = primaryKey && process.env[primaryKey] && process.env[primaryKey].trim() !== '';
  const hasAnyLLM = Object.values(llmKeyMap).some(
    (k) => process.env[k] && process.env[k].trim() !== ''
  );

  if (!hasAnyLLM) {
    missing.push(`LLM API key (set ${primaryKey || 'GEMINI_API_KEY'} or any of: ${Object.values(llmKeyMap).join(', ')})`);
  } else if (!hasPrimaryLLM) {
    const availableKeys = Object.entries(llmKeyMap)
      .filter(([, k]) => process.env[k] && process.env[k].trim() !== '')
      .map(([name]) => name);
    console.warn(
      `[env-validate] WARN: LLM_PROVIDER is '${llmProvider}' but ${primaryKey} is not set. ` +
      `Fallback providers available: ${availableKeys.join(', ')}. Chat may use a slower fallback.`
    );
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
