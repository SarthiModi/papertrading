// Turns an order into a trade. Called by workers.
//
// EXECUTION MODEL (a SIMPLIFICATION, not a real exchange):
//   * No order book, no slippage, no partial fills. An order fills completely at the latest cached quote, or not at all.
//   * Market order : fills at the latest FRESH quote. Stale/missing quote -> retry later; after max attempts -> rejected.
//   * Limit buy    : fills when quote price <= limit price.   Limit sell: when quote price >= limit price.
//     (It fills at the quote price, i.e. the user gets the limit or better.) Otherwise it stays "pending".
//
// RULES FOR SAFETY:
//   * We read the quote BEFORE opening the DB transaction (never hold locks while waiting on slow things).
//   * The transaction is short and locks rows in a fixed order: order -> account -> holdings.
//   * Re-running it for an order that is already done does nothing (idempotent).
import { query, withTransaction, retryOnConflict } from '../db/pool.js';
import { toScaled } from '../utils/money.js';
import { getQuote } from './marketData/marketDataService.js';
import { assertTransition } from './orderStateMachine.js';
import { closeOrderInTx } from './reservationService.js';
import { closeOrder } from './orderService.js';
import { safePublish, notifyAccountChanged } from './notifications.js';

export function isLimitEligible(side, quotePrice, limitPrice) {
  const price = toScaled(quotePrice);
  const limit = toScaled(limitPrice);
  return side === 'buy' ? price <= limit : price >= limit;
}

// Returns one of: 'filled' | 'rejected' | 'not_eligible' | 'retry_later' | 'already_processed' | 'missing'
// options.hooks.afterWrites is a TEST HOOK: it runs after all writes but before COMMIT, so tests can
// simulate a crash in the middle of a trade and prove that everything rolls back.
export async function processOrder(orderId, { attempt = 1, maxAttempts = 5, hooks = {} } = {}) {
  const { rows } = await query('SELECT o.*, s.symbol FROM orders o JOIN stocks s ON s.id = o.stock_id WHERE o.id = $1', [orderId]);
  const order = rows[0];
  if (!order) return 'missing';
  if (order.status !== 'pending' && order.status !== 'processing') return 'already_processed'; // duplicate delivery

  const quote = await getQuote(order.symbol);
  const usable = quote && quote.status === 'fresh';
  if (!usable) {
    if (order.order_type === 'limit') return 'not_eligible'; // wait; the sweeper will try again
    if (attempt >= maxAttempts) {
      await closeOrder(orderId, { to: 'rejected', reason: 'Market data was unavailable or stale', skipIfFinal: true });
      return 'rejected';
    }
    return 'retry_later';
  }
  if (order.order_type === 'limit' && !isLimitEligible(order.side, quote.price, order.limit_price)) return 'not_eligible';

  // pending -> processing (its own tiny transaction, so other users see the status right away)
  if (order.status === 'pending') {
    const moved = await query("UPDATE orders SET status = 'processing', updated_at = now() WHERE id = $1 AND status = 'pending'", [orderId]);
    if (moved.rowCount === 1) await safePublish(order.user_id, 'ORDER_PROCESSING', { orderId: String(order.id), symbol: order.symbol });
  }

  let result;
  try {
    result = await retryOnConflict(() => withTransaction((client) => executeFill(client, orderId, quote, hooks)));
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'transactions_order_fill_unique') return 'already_processed';
    throw err;
  }

  if (result.outcome === 'filled') {
    await safePublish(result.userId, 'ORDER_FILLED', {
      orderId: String(orderId), symbol: result.symbol, side: result.side, quantity: result.quantity, executionPrice: quote.price,
    });
    await notifyAccountChanged(result.userId, result.symbol);
  } else if (result.outcome === 'rejected') {
    await safePublish(result.userId, 'ORDER_REJECTED', { orderId: String(orderId), symbol: result.symbol, reason: result.reason });
    await notifyAccountChanged(result.userId, result.symbol);
  }
  return result.outcome;
}

// The money-moving transaction. Everything here commits together or not at all.
async function executeFill(client, orderId, quote, hooks) {
  // LOCK 1: the order row. A second worker holding the same job waits here, then sees "filled" and stops.
  const { rows } = await client.query(
    'SELECT o.*, s.symbol FROM orders o JOIN stocks s ON s.id = o.stock_id WHERE o.id = $1 FOR UPDATE OF o', [orderId]);
  const order = rows[0];
  if (!order || (order.status !== 'pending' && order.status !== 'processing')) return { outcome: 'already_processed' };
  assertTransition(order.status, 'filled');

  // LOCK 2: the user's cash account.
  await client.query('SELECT 1 FROM user_accounts WHERE user_id = $1 FOR UPDATE', [order.user_id]);
  const reservation = (await client.query(
    'SELECT reserved_cash, reserved_shares FROM order_reservations WHERE order_id = $1 AND released_at IS NULL FOR UPDATE', [orderId])).rows[0];
  if (!reservation) {
    await closeOrderInTx(client, order, 'failed', 'Internal error: reservation missing');
    return { outcome: 'rejected', userId: order.user_id, symbol: order.symbol, reason: 'Internal error: reservation missing' };
  }

  // All money math happens inside PostgreSQL NUMERIC (exact), never in JavaScript floats.
  const math = (await client.query(
    'SELECT ($1::int * $2::numeric) AS total, ($1::int * $2::numeric) <= $3::numeric AS affordable',
    [order.quantity, quote.price, reservation.reserved_cash ?? '0'])).rows[0];

  if (order.side === 'buy') {
    if (!math.affordable) {
      const reason = 'Price moved above the amount reserved for this order';
      await closeOrderInTx(client, order, 'rejected', reason);
      return { outcome: 'rejected', userId: order.user_id, symbol: order.symbol, reason };
    }
    // Spend `total`; give back the unused part of the reservation.
    await client.query(
      `UPDATE user_accounts
         SET available_balance = available_balance + ($1::numeric - $2::numeric),
             reserved_balance  = reserved_balance - $1::numeric, updated_at = now()
       WHERE user_id = $3`,
      [reservation.reserved_cash, math.total, order.user_id]);
    // LOCK 3: holdings (created on first purchase). New average = weighted average of old and new.
    await client.query(
      `INSERT INTO holdings (user_id, stock_id, quantity, average_buy_price) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, stock_id) DO UPDATE SET
         average_buy_price = ROUND((holdings.quantity * holdings.average_buy_price + EXCLUDED.quantity * EXCLUDED.average_buy_price)
                                   / (holdings.quantity + EXCLUDED.quantity), 4),
         quantity = holdings.quantity + EXCLUDED.quantity, updated_at = now()`,
      [order.user_id, order.stock_id, order.quantity, quote.price]);
    await insertTransaction(client, order, quote, math.total, null);
  } else {
    const holding = (await client.query(
      'SELECT quantity, average_buy_price FROM holdings WHERE user_id = $1 AND stock_id = $2 FOR UPDATE', [order.user_id, order.stock_id])).rows[0];
    if (!holding) throw new Error('Invariant broken: sell order without holding');
    const pnl = (await client.query('SELECT ($1::numeric - $2::numeric) * $3::int AS pnl', [quote.price, holding.average_buy_price, order.quantity])).rows[0].pnl;
    await client.query(
      'UPDATE holdings SET quantity = quantity - $1, reserved_quantity = reserved_quantity - $1, updated_at = now() WHERE user_id = $2 AND stock_id = $3',
      [order.quantity, order.user_id, order.stock_id]);
    await client.query('DELETE FROM holdings WHERE user_id = $1 AND stock_id = $2 AND quantity = 0', [order.user_id, order.stock_id]);
    await client.query('UPDATE user_accounts SET available_balance = available_balance + $1::numeric, updated_at = now() WHERE user_id = $2', [math.total, order.user_id]);
    await insertTransaction(client, order, quote, math.total, pnl);
  }

  await client.query('UPDATE order_reservations SET released_at = now() WHERE order_id = $1', [orderId]); // consumed
  await client.query("UPDATE orders SET status = 'filled', updated_at = now() WHERE id = $1", [orderId]);
  if (hooks.afterWrites) await hooks.afterWrites(); // TEST HOOK (see top of file)
  return { outcome: 'filled', userId: order.user_id, symbol: order.symbol, side: order.side, quantity: order.quantity };
}

// UNIQUE (order_id, fill_number) means a second execution of the same order fails right here.
function insertTransaction(client, order, quote, total, realizedPnl) {
  return client.query(
    `INSERT INTO transactions (order_id, fill_number, user_id, stock_id, side, quantity, execution_price, total_amount, realized_pnl, quote_timestamp, quote_source)
     VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [order.id, order.user_id, order.stock_id, order.side, order.quantity, quote.price, total, realizedPnl, quote.sourceTimestamp, quote.source]);
}
