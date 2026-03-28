import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import rawBody from 'fastify-raw-body';
import { env } from './config/env.js';
import { pool } from './db/client.js';
import { BossService } from './jobs/boss.js';
import { isAppError } from './lib/errors.js';
import { registerHealthRoute } from './routes/health.js';
import { registerTelnyxRoutes } from './routes/telnyx.js';
import { AutomationService } from './services/automations.js';
import { ComposioService } from './services/composio.js';
import { MessageProcessor } from './services/message-processor.js';
import { OpenAIAgentService } from './services/openai-agent.js';
import { TelnyxService } from './services/telnyx.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string | Buffer<ArrayBufferLike>;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL
    }
  });

  await app.register(cors, {
    origin: true
  });

  await app.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true
  });

  const boss = new BossService();
  const telnyx = new TelnyxService();
  const openaiAgent = new OpenAIAgentService();
  const composio = new ComposioService();
  const automations = new AutomationService();
  const messageProcessor = new MessageProcessor({
    automations,
    boss,
    composio,
    openaiAgent,
    telnyx
  });

  await boss.start((inboundMessageId) => messageProcessor.processQueuedInboundMessage(inboundMessageId));

  await registerHealthRoute(app);
  await registerTelnyxRoutes(app, {
    messageProcessor,
    telnyx
  });

  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    app.log.error({ error }, 'Unhandled request error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error.'
      }
    });
  });

  app.addHook('onClose', async () => {
    await boss.stop();
    await pool.end();
  });

  return app;
}
