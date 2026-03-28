import type { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors.js';
import type { MessageProcessor } from '../services/message-processor.js';
import type { TelnyxService } from '../services/telnyx.js';

type RegisterTelnyxRoutesInput = {
  messageProcessor: MessageProcessor;
  telnyx: TelnyxService;
};

export async function registerTelnyxRoutes(
  app: FastifyInstance,
  deps: RegisterTelnyxRoutesInput
) {
  app.post('/webhooks/telnyx/inbound', {
    config: {
      rawBody: true
    }
  }, async (request, reply) => {
    const rawBody = typeof request.rawBody === 'string'
      ? request.rawBody
      : request.rawBody?.toString('utf8');

    if (!rawBody) {
      throw new AppError(400, 'RAW_BODY_MISSING', 'Raw request body is required for Telnyx signature validation.');
    }

    deps.telnyx.verifyInboundWebhook(rawBody, request.headers as Record<string, unknown>);

    const payload = request.body as Record<string, unknown>;
    const parsed = deps.telnyx.parseInboundMessage(payload);

    if (!parsed) {
      return reply.code(200).send({ received: true, ignored: true });
    }

    const result = await deps.messageProcessor.recordAndQueueInboundMessage(parsed);
    return reply.code(200).send({
      received: true,
      duplicate: result.duplicate
    });
  });
}
