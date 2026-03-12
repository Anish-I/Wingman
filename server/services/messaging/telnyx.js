'use strict';
const { sendSMS, validateWebhook } = require('../telnyx');

class TelnyxProvider {
  async sendMessage(to, body) {
    return sendSMS(to, body);
  }

  validateIncoming(rawBody, headers) {
    return validateWebhook(rawBody, headers);
  }

  parseIncoming(payload) {
    const msg = payload?.data?.payload;
    return {
      from: msg?.from?.phone_number,
      body: msg?.text,
      messageId: payload?.data?.id,
    };
  }
}

module.exports = TelnyxProvider;
