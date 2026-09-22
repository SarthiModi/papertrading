// A TRANSACTION row = one executed trade (a "fill"). Insert-only ledger.
// UNIQUE (order_id, fill_number) is our last line of defence against executing the same order twice:
// a second attempt to insert fill #1 for the same order fails at the database level.
// (v1 has no partial fills, so fill_number is always 1; the column keeps the door open.)
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE transactions (
      id               BIGSERIAL PRIMARY KEY,
      order_id         BIGINT NOT NULL REFERENCES orders(id),
      fill_number      INTEGER NOT NULL DEFAULT 1 CHECK (fill_number > 0),
      user_id          BIGINT NOT NULL REFERENCES users(id),
      stock_id         BIGINT NOT NULL REFERENCES stocks(id),
      side             VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
      quantity         INTEGER NOT NULL CHECK (quantity > 0),
      execution_price  NUMERIC(18,4) NOT NULL CHECK (execution_price > 0),
      total_amount     NUMERIC(18,4) NOT NULL CHECK (total_amount > 0),
      realized_pnl     NUMERIC(18,4),            -- only filled for SELL rows
      quote_timestamp  TIMESTAMPTZ NOT NULL,     -- when the market quote used was observed
      quote_source     VARCHAR(20) NOT NULL CHECK (quote_source IN ('finnhub', 'simulated')),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT transactions_order_fill_unique UNIQUE (order_id, fill_number)
    );
    CREATE INDEX transactions_user_created_idx ON transactions (user_id, created_at DESC);
  `);
};
export const down = (pgm) => {
  pgm.sql('DROP TABLE transactions;');
};
