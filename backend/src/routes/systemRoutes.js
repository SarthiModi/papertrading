// Educational metrics. Login required, but NOTHING here returns any user's private data:
// only counts, averages, job ids/priorities and algorithm demos.
import { Router } from 'express';
import Joi from 'joi';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { config } from '../config/env.js';
import { queueStats, recentClaims } from '../queue/redisQueue.js';
import { workerStats } from '../workers/orderWorker.js';
import { simulateScheduling } from '../scheduler/schedulers.js';
import { runCacheDemo } from '../educational/cacheDemo.js';

const router = Router();
router.use(requireAuth);

router.get('/queue-stats', async (req, res) => sendSuccess(res, await queueStats()));
router.get('/worker-stats', async (req, res) => sendSuccess(res, await workerStats()));
router.get('/scheduler-stats', async (req, res) =>
  sendSuccess(res, {
    liveQueueMode: config.queue.schedulerMode,
    note: 'Application-level job scheduling for order jobs. Not the OS scheduler, not exchange order matching.',
    recentClaims: await recentClaims(), // newest first: the REAL order in which workers received jobs
  }));

// Textbook simulation on a fixed sample so FCFS and priority can be compared side by side.
const SAMPLE_JOBS = [
  { id: 'A', arrival: 0, burst: 8, priority: 1 },
  { id: 'B', arrival: 1, burst: 4, priority: 2 },
  { id: 'C', arrival: 2, burst: 9, priority: 1 },
  { id: 'D', arrival: 3, burst: 5, priority: 2 },
];
router.get('/scheduler-demo', (req, res) =>
  sendSuccess(res, { jobs: SAMPLE_JOBS, fcfs: simulateScheduling(SAMPLE_JOBS, 'fcfs'), priority: simulateScheduling(SAMPLE_JOBS, 'priority') }));

const cacheQuery = Joi.object({
  capacity: Joi.number().integer().min(1).max(10).default(3),
  sequence: Joi.string().pattern(/^[A-Z.,]{1,200}$/).default('AAPL,MSFT,AAPL,TSLA,AAPL,NVDA,MSFT,TSLA,AAPL,KO'),
});
router.get('/cache-demo', validate(cacheQuery, 'query'), (req, res) => {
  const { capacity, sequence } = req.validated.query;
  const keys = sequence.split(',').filter(Boolean);
  sendSuccess(res, { note: 'Educational simulation. The real quote cache is Redis.', lru: runCacheDemo('lru', capacity, keys), lfu: runCacheDemo('lfu', capacity, keys) });
});

export default router;
