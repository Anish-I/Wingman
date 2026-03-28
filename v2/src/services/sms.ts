import twilio from 'twilio';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export type ParsedInboundMessage = {
  eventId: string;
  fromPhone: string;
  text: string;
  rawPayload: Record<string, unknown>;
};

export class SmsService {
  private readonly client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

  verifyWebhook(rawBody: string, signature: string, url: string) {
    const isValid = twilio.validateRequest(
      env.TWILIO_AUTH_TOKEN,
      signature,
      url,
      Object.fromEntries(new URLSearchParams(rawBody))
    );

    if (!isValid) {
      throw new AppError(401, 'INVALID_TWILIO_SIGNATURE', 'Invalid Twilio webhook signature.');
    }
  }

  parseInboundMessage(body: Record<string, unknown>): ParsedInboundMessage | null {
    const messageSid = String(body.MessageSid ?? '');
    const from = String(body.From ?? '');
    const text = String(body.Body ?? '').trim();

    if (!messageSid || !from || !text) {
      return null;
    }

    return {
      eventId: messageSid,
      fromPhone: from,
      text,
      rawPayload: body
    };
  }

  async sendMessage(to: string, text: string) {
    try {
      const message = await this.client.messages.create({
        from: env.TWILIO_FROM_NUMBER,
        to,
        body: text
      });
      return { sid: message.sid, status: message.status };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown Twilio error';
      throw new AppError(502, 'TWILIO_SEND_FAILED', msg, error);
    }
  }
}
