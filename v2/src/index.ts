import { env } from './config/env.js';
import { buildApp } from './app.js';
import { logger } from './lib/logger.js';

const app = await buildApp();

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({
    host: '0.0.0.0',
    port: env.PORT
  });
} catch (error) {
  logger.error({ error }, 'Failed to start wingman-v2');
  process.exit(1);
}
