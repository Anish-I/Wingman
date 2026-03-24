'use strict';
const TelnyxProvider = require('./telnyx');
const TwilioProvider = require('./twilio');
const StubProvider = require('./stub');

let PROVIDER = (process.env.MESSAGING_PROVIDER || '').toLowerCase();

// Auto-detect provider from env vars
if (!PROVIDER) {
  if (process.env.TWILIO_ACCOUNT_SID) {
    PROVIDER = 'twilio';
  } else if (process.env.TELNYX_API_KEY) {
    PROVIDER = 'telnyx';
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[messaging] FATAL: No SMS credentials set and NODE_ENV=production — refusing to start with stub provider');
    }
    PROVIDER = 'stub';
    console.warn('[messaging] WARNING: No SMS credentials set — falling back to stub provider');
  }
}

let provider;
if (PROVIDER === 'stub') {
  provider = new StubProvider();
} else if (PROVIDER === 'twilio') {
  provider = new TwilioProvider();
} else {
  provider = new TelnyxProvider();
}

console.log(`[messaging] provider: ${PROVIDER}`);
module.exports = { provider, PROVIDER, TwilioProvider, TelnyxProvider, StubProvider };
