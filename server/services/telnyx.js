const fromNumber = process.env.TELNYX_PHONE_NUMBER;
const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

async function sendSMS(to, body) {
  const response = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
    },
    body: JSON.stringify({
      from: fromNumber,
      to,
      text: body,
      messaging_profile_id: messagingProfileId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Telnyx API error ${response.status}: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return data.data.id;
}

/**
 * Validate Telnyx webhook signature (ed25519).
 * Requires TELNYX_PUBLIC_KEY set to the public key from your Telnyx portal.
 * Returns true if not configured (dev mode).
 */
function validateWebhook(rawBody, headers) {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey) return true;

  const signature = headers['telnyx-signature-ed25519-signature'];
  const timestamp = headers['telnyx-signature-ed25519-timestamp'];
  if (!signature || !timestamp) return false;

  try {
    const crypto = require('crypto');
    const signedPayload = `${timestamp}|${rawBody}`;
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, Buffer.from(signedPayload), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

module.exports = { sendSMS, validateWebhook };
