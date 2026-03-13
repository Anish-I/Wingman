'use strict';
const TelnyxProvider = require('./telnyx');
const StubProvider = require('./stub');

let PROVIDER = (process.env.MESSAGING_PROVIDER || '').toLowerCase();

// Auto-fallback to stub if TELNYX_API_KEY is missing or empty
if (!PROVIDER) {
  if (!process.env.TELNYX_API_KEY) {
    PROVIDER = 'stub';
    console.warn('[messaging] WARNING: TELNYX_API_KEY not set — falling back to stub provider');
  } else {
    PROVIDER = 'telnyx';
  }
}

let provider;
if (PROVIDER === 'stub') {
  provider = new StubProvider();
} else {
  provider = new TelnyxProvider();
}

console.log(`[messaging] provider: ${PROVIDER}`);
module.exports = { provider };
