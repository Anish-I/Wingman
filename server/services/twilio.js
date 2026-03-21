'use strict';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

async function sendSMS(to, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
    },
    body: new URLSearchParams({ From: fromNumber, To: to, Body: body }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Twilio API error ${response.status}: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return data.sid;
}

/**
 * Validate Twilio webhook signature.
 * Requires TWILIO_AUTH_TOKEN set.
 * Returns true if not configured (dev mode).
 */
function validateWebhook(req) {
  if (!authToken) return true;

  const signature = req.headers['x-twilio-signature'];
  if (!signature) return false;

  try {
    const crypto = require('crypto');
    const url = process.env.BASE_URL + req.originalUrl;

    // Sort POST params and append to URL
    const params = req.body || {};
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
      data += key + params[key];
    }

    // NOTE: Twilio's X-Twilio-Signature uses HMAC-SHA1 by design.
    // SHA-1 is considered weak, but we MUST use it here because Twilio
    // computes signatures with SHA-1 on their end. Switching to SHA-256
    // would break validation. This cannot be fixed without Twilio
    // adding SHA-256 signature support (they currently do not).
    // See: https://www.twilio.com/docs/usage/security#validating-requests
    const hmac = crypto.createHmac('sha1', authToken)
      .update(data)
      .digest('base64');

    return hmac === signature;
  } catch {
    return false;
  }
}

module.exports = { sendSMS, validateWebhook };
