import Redis from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 2, // fail fast instead of hanging forever when Redis is down
});

redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
redis.on('connect', () => logger.info('Redis connected'));
