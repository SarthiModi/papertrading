import { ApiError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

export function notFound(req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

// Express recognises an error handler by its 4 parameters. Keep all 4!
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }
  // Malformed JSON body etc.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' },
    });
  }
  // PostgreSQL deadlock / serialization failure that survived our retries: tell the client to try again.
  if (err.code === '40P01' || err.code === '40001') {
    return res.status(503).json({ success: false, error: { code: 'TRY_AGAIN', message: 'The system is busy, please retry' } });
  }
  // Unknown error: log details for us, but send the client a generic message.
  logger.error('Unhandled error', { requestId: req.id, error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
}
