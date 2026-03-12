'use strict';

class StubProvider {
  async sendMessage(to, body) {
    console.log(`[STUB SMS → ${to}]: ${body}`);
    return { id: `stub-${Date.now()}` };
  }

  validateIncoming(rawBody, headers) {
    return true;
  }

  parseIncoming(payload) {
    // When testing via stub, payload is already { from, body, messageId }
    return payload;
  }
}

module.exports = StubProvider;
