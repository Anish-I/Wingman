import type { FastifyInstance } from 'fastify';
import type { MessageProcessor } from '../services/message-processor.js';
import type { SmsService } from '../services/sms.js';

type RegisterSmsRoutesInput = {
  messageProcessor: MessageProcessor;
  sms: SmsService;
};

export async function registerSmsRoutes(
  app: FastifyInstance,
  deps: RegisterSmsRoutesInput
) {
  // Twilio sends application/x-www-form-urlencoded
  app.post('/webhooks/twilio/inbound', {
    config: {
      rawBody: true
    }
  }, async (request, reply) => {
    const rawBody = typeof request.rawBody === 'string'
      ? request.rawBody
      : request.rawBody?.toString('utf8');

    if (!rawBody) {
      return reply.code(400).send('');
    }

    const signature = String(
      (request.headers as Record<string, unknown>)['x-twilio-signature'] ?? ''
    );

    // Build the full webhook URL for validation
    const proto = request.headers['x-forwarded-proto'] ?? 'http';
    const host = request.headers['x-forwarded-host'] ?? request.headers.host ?? 'localhost';
    const url = `${proto}://${host}${request.url}`;

    deps.sms.verifyWebhook(rawBody, signature, url);

    const parsed = deps.sms.parseInboundMessage(request.body as Record<string, unknown>);
    if (!parsed) {
      // Return TwiML empty response
      reply.header('Content-Type', 'text/xml');
      return reply.code(200).send('<Response></Response>');
    }

    const result = await deps.messageProcessor.recordAndQueueInboundMessage(parsed);

    // Twilio expects TwiML response
    reply.header('Content-Type', 'text/xml');
    return reply.code(200).send('<Response></Response>');
  });
}
