import { assertTransition } from './orderStateMachine.js';

// Gives back whatever an order had locked (cash for buys, shares for sells) EXACTLY ONCE.
// The `released_at IS NULL` condition is what makes a second call a harmless no-op.
// Caller must already hold the order row lock inside a transaction.
export async function releaseReservation(client, order) {
  const { rows } = await client.query(
    'SELECT reserved_cash, reserved_shares FROM order_reservations WHERE order_id = $1 AND released_at IS NULL FOR UPDATE',
    [order.id]
  );
  const reservation = rows[0];
  if (!reservation) return false;
  if (reservation.reserved_cash !== null) {
    await client.query(
      `UPDATE user_accounts
         SET available_balance = available_balance + $1, reserved_balance = reserved_balance - $1, updated_at = now()
       WHERE user_id = $2`,
      [reservation.reserved_cash, order.user_id]
    );
  } else {
    await client.query(
      `UPDATE holdings SET reserved_quantity = reserved_quantity - $1, updated_at = now()
       WHERE user_id = $2 AND stock_id = $3`,
      [reservation.reserved_shares, order.user_id, order.stock_id]
    );
  }
  await client.query('UPDATE order_reservations SET released_at = now() WHERE order_id = $1', [order.id]);
  return true;
}

// Moves an order to a final non-filled status (cancelled / rejected / failed) and releases its reservation.
// Must be called inside a transaction, with the order row already locked FOR UPDATE.
export async function closeOrderInTx(client, order, newStatus, reason) {
  assertTransition(order.status, newStatus);
  // Lock order: order row (already held) -> account -> holdings. Same everywhere, so no deadlocks.
  await client.query('SELECT 1 FROM user_accounts WHERE user_id = $1 FOR UPDATE', [order.user_id]);
  await releaseReservation(client, order);
  await client.query('UPDATE orders SET status = $1, reject_reason = $2, updated_at = now() WHERE id = $3', [
    newStatus,
    reason,
    order.id,
  ]);
}
