// After the database COMMIT succeeded, tell the user's browser what changed.
// Failures here are only logged: a missed notification must never undo or fail a finished trade.
// (The frontend refetches authoritative state from the API when it reconnects.)
import { query } from '../db/pool.js';
import { publishUserEvent } from '../websocket/events.js';
import { logger } from '../utils/logger.js';

export async function safePublish(userId, type, data) {
  try {
    await publishUserEvent(userId, type, data);
  } catch (err) {
    logger.warn('Could not publish event', { type, error: err.message });
  }
}

export async function notifyAccountChanged(userId, symbol) {
  const { rows } = await query('SELECT available_balance, reserved_balance FROM user_accounts WHERE user_id = $1', [userId]);
  if (rows[0]) {
    await safePublish(userId, 'BALANCE_UPDATED', {
      availableBalance: rows[0].available_balance,
      reservedBalance: rows[0].reserved_balance,
    });
  }
  if (symbol) await safePublish(userId, 'HOLDINGS_UPDATED', { symbol });
  await safePublish(userId, 'PORTFOLIO_UPDATED', {});
}
