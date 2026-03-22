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
module.exports = { provider, PROVIDER };
