import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

// Gives every request a unique id, returns it in a header, and logs each request.
// When something breaks you can search the logs for that one id.
export function requestId(req, res, next) {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const started = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - started,
    });
  });
  next();
}
