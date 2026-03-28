import Telnyx from 'telnyx';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const telnyxFactory = Telnyx as unknown as {
  new (options: { apiKey: string }): {
    webhooks?: {
      constructEvent?: (
        rawBody: string,
        signature: string,
        timestamp: string,
        publicKey: string
      ) => unknown;
    };
  };
};

type TelnyxMessagePayload = {
  data?: {
    id?: string;
    event_type?: string;
    payload?: {
      from?: { phone_number?: string };
      text?: string;
    };
  };
};

export type ParsedInboundMessage = {
  eventId: string;
  fromPhone: string;
  text: string;
  rawPayload: Record<string, unknown>;
};

export class TelnyxService {
  private readonly webhookClient = new telnyxFactory({ apiKey: env.TELNYX_API_KEY });

  verifyInboundWebhook(rawBody: string, headers: Record<string, unknown>) {
    const timestamp = String(headers['telnyx-timestamp'] ?? '');
    const signature = String(headers['telnyx-signature-ed25519'] ?? '');

    if (!timestamp || !signature) {
      throw new AppError(401, 'MISSING_TELNYX_SIGNATURE', 'Missing Telnyx signature headers.');
    }

    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > env.TELNYX_WEBHOOK_TOLERANCE_SECONDS) {
      throw new AppError(401, 'STALE_TELNYX_WEBHOOK', 'Webhook timestamp is outside the accepted window.');
    }

    const constructEvent = this.webhookClient.webhooks?.constructEvent;
    if (typeof constructEvent !== 'function') {
      throw new AppError(500, 'TELNYX_SDK_UNAVAILABLE', 'Telnyx SDK webhook verification is unavailable.');
    }

    try {
      constructEvent(rawBody, signature, timestamp, env.TELNYX_PUBLIC_KEY);
    } catch (error) {
      throw new AppError(401, 'INVALID_TELNYX_SIGNATURE', 'Invalid Telnyx webhook signature.', error);
    }
  }

  parseInboundMessage(payload: Record<string, unknown>): ParsedInboundMessage | null {
    const body = payload as TelnyxMessagePayload;
    const event = body.data;
    if (!event || event.event_type !== 'message.received') {
      return null;
    }

    const eventId = event.id ?? '';
    const fromPhone = event.payload?.from?.phone_number ?? '';
    const text = event.payload?.text ?? '';

    if (!eventId || !fromPhone || !text) {
      throw new AppError(400, 'INVALID_TELNYX_PAYLOAD', 'Inbound message payload is missing required fields.');
    }

    return {
      eventId,
      fromPhone,
      text,
      rawPayload: payload
    };
  }

  async sendMessage(to: string, text: string) {
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.TELNYX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from: env.TELNYX_FROM_NUMBER,
        to,
        text,
        ...(env.TELNYX_MESSAGING_PROFILE_ID
          ? { messaging_profile_id: env.TELNYX_MESSAGING_PROFILE_ID }
          : {})
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AppError(response.status, 'TELNYX_SEND_FAILED', 'Telnyx rejected the outbound SMS.', body);
    }

    return response.json();
  }
}
