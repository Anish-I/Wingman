'use strict';
const TelnyxProvider = require('./telnyx');
const StubProvider = require('./stub');

const PROVIDER = (process.env.MESSAGING_PROVIDER || 'telnyx').toLowerCase();

let provider;
if (PROVIDER === 'stub') {
  provider = new StubProvider();
} else {
  provider = new TelnyxProvider();
}

console.log(`[messaging] provider: ${PROVIDER}`);
module.exports = { provider };
