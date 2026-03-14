'use strict';
const { sendSMS, validateWebhook } = require('../twilio');

class TwilioProvider {
  async sendMessage(to, body) {
    return sendSMS(to, body);
  }

  validateIncoming(req) {
    return validateWebhook(req);
  }

  parseIncoming(body) {
    return {
      from: body.From,
      body: body.Body,
      messageId: body.MessageSid,
    };
  }
}

module.exports = TwilioProvider;
