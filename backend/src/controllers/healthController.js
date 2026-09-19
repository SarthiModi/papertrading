import { query } from '../db/pool.js';
import { redis } from '../redis/client.js';
import { sendSuccess } from '../utils/apiResponse.js';

export function liveness(req, res) {
  sendSuccess(res, { status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
}

export async function readiness(req, res) {
  const checks = { postgres: 'down', redis: 'down' };

  try {
    await query('SELECT 1');
    checks.postgres = 'up';
  } catch (err) {
  }

  try {
    const reply = await redis.ping();
    if (reply === 'PONG') checks.redis = 'up';
  } catch (err) {
  }

  const allUp = checks.postgres === 'up' && checks.redis === 'up';
  res.status(allUp ? 200 : 503).json({
    success: allUp,
    data: { status: allUp ? 'ready' : 'degraded', checks },
  });
}