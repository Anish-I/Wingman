import { PgBoss, type Job } from 'pg-boss';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export const inboundMessageQueue = 'wm-inbound-message';

export class BossService {
  private boss: PgBoss;
  private started = false;

  constructor() {
    this.boss = new PgBoss({
      connectionString: env.DATABASE_URL
    });
  }

  async start(onInboundMessage: (inboundMessageId: string) => Promise<void>) {
    if (this.started) {
      return;
    }

    await this.boss.start();
    await this.boss.createQueue(inboundMessageQueue);
    await this.boss.work<{ inboundMessageId?: string }>(
      inboundMessageQueue,
      async (jobs: Job<{ inboundMessageId?: string }>[]) => {
        for (const job of jobs) {
          const inboundMessageId = String(job.data?.inboundMessageId ?? '');
          if (!inboundMessageId) {
            logger.warn({ jobId: job.id }, 'Inbound queue job missing inboundMessageId');
            continue;
          }

          try {
            await onInboundMessage(inboundMessageId);
          } catch (error) {
            logger.error({ error, jobId: job.id, inboundMessageId }, 'Job handler threw');
          }
        }
      }
    );

    this.started = true;
    logger.info('pg-boss started');
  }

  async stop() {
    if (!this.started) {
      return;
    }

    await this.boss.stop();
    this.started = false;
  }

  async enqueueInboundMessage(inboundMessageId: string) {
    await this.boss.send(inboundMessageQueue, { inboundMessageId });
  }
}
