const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

async function sendSMS(to, body) {
  const message = await client.messages.create({
    body,
    from: fromNumber,
    to,
  });
  return message.sid;
}

async function sendMMS(to, body, mediaUrl) {
  const message = await client.messages.create({
    body,
    from: fromNumber,
    to,
    mediaUrl: Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl],
  });
  return message.sid;
}

function validateWebhook(req) {
  const twilioSignature = req.headers['x-twilio-signature'] || '';
  const url = `${process.env.BASE_URL}${req.originalUrl}`;
  return twilio.validateRequest(authToken, twilioSignature, url, req.body);
}

module.exports = { sendSMS, sendMMS, validateWebhook };
