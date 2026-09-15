// server.js starts everything that lives in the API process:
//   HTTP server (Express) + WebSocket server + market-data poller + outbox publisher + limit-order sweeper.
// Workers run in their own process (npm run worker) unless RUN_WORKERS_IN_API=true (handy in development).
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
