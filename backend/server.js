
import { config } from './config/env.js';
import { createApp } from './app.js';
import { pool } from './db/pool.js';
import { redis } from './redis/client.js';
import { logger } from './utils/logger.js';
import { attachWebSocket } from './websocket/wsServer.js';
import { startMarketPoller } from './services/marketData/marketPoller.js';
import { startOutboxPublisher } from './queue/outboxPublisher.js';
import { startLimitSweeper } from './queue/limitSweeper.js';
import { startWorkers } from './workers/orderWorker.js';

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info('PaperBull backend listening', { port: config.port, env: config.nodeEnv });
});
const websocket = attachWebSocket(server);
const stopPoller = startMarketPoller();
const stopOutbox = startOutboxPublisher();
const stopSweeper = startLimitSweeper();
const stopWorkers = process.env.RUN_WORKERS_IN_API === 'true' ? startWorkers() : async () => {};

async function shutdown(signal) {
  logger.info('Shutting down', { signal });
  stopPoller(); stopOutbox(); stopSweeper();
  server.close();
  await stopWorkers();
  await websocket.close();
  await pool.end();
  redis.disconnect();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));