// What a user owns. Composite primary key = at most ONE row per (user, stock).
//   quantity          : total shares owned
//   reserved_quantity : shares locked by pending SELL orders
// The CHECKs guarantee: never negative, and never reserve more than you own.
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE holdings (
      user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stock_id           BIGINT NOT NULL REFERENCES stocks(id),
      quantity           INTEGER       NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      reserved_quantity  INTEGER       NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
      average_buy_price  NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (average_buy_price >= 0),
      updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, stock_id),
      CONSTRAINT reserved_not_above_quantity CHECK (reserved_quantity <= quantity)
    );
  `);
};
export const down = (pgm) => {
  pgm.sql('DROP TABLE holdings;');
};
