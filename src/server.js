/**
 * Entry point: start the HTTP server, and shut down gracefully on SIGTERM/SIGINT
 * — closing the Prisma connection pool so a deploy never drops a booking mid-write.
 * (Straight from the Node runtime lesson's graceful-shutdown pattern.)
 */
import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { disconnectDb } from './db.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`ridematch API listening on :${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await disconnectDb();
    logger.info('closed HTTP server and DB pool — bye');
    process.exit(0);
  });
  setTimeout(() => { logger.error('forced exit after timeout'); process.exit(1); }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => { logger.error({ reason }, 'unhandledRejection'); shutdown('unhandledRejection'); });
