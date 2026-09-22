// Records WHAT each pending order locked, so it can be released exactly once.
//   buy  order -> reserved_cash set,   reserved_shares NULL
//   sell order -> reserved_shares set, reserved_cash   NULL
// released_at stays NULL while the reservation is active.
// The running totals live in user_accounts / holdings; this table is the per-order audit trail.
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE order_reservations (
      order_id         BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
      reserved_cash    NUMERIC(18,4) CHECK (reserved_cash   > 0),
      reserved_shares  INTEGER       CHECK (reserved_shares > 0),
      released_at      TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT exactly_one_reservation_kind CHECK (
        (reserved_cash IS NOT NULL AND reserved_shares IS NULL) OR
        (reserved_cash IS NULL AND reserved_shares IS NOT NULL)
      )
    );
  `);
};
export const down = (pgm) => {
  pgm.sql('DROP TABLE order_reservations;');
};
