// An ORDER is an intention to trade. (A TRANSACTION, created later, is an actual execution.)
// Legal status transitions are enforced in application code (Phase 4), see docs/database-design.md.
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE orders (
      id               BIGSERIAL PRIMARY KEY,
      user_id          BIGINT NOT NULL REFERENCES users(id),
      stock_id         BIGINT NOT NULL REFERENCES stocks(id),
      order_type       VARCHAR(10) NOT NULL CHECK (order_type IN ('market', 'limit')),
      side             VARCHAR(4)  NOT NULL CHECK (side IN ('buy', 'sell')),
      quantity         INTEGER     NOT NULL CHECK (quantity > 0),
      limit_price      NUMERIC(18,4),
      status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','processing','partially_filled',
                                         'filled','rejected','cancelled','failed')),
      priority         SMALLINT    NOT NULL DEFAULT 1 CHECK (priority IN (1, 2)),  -- 1 normal, 2 high (scheduler demo)
      idempotency_key  VARCHAR(100) NOT NULL,
      reject_reason    TEXT,
      expires_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      -- limit orders MUST have a positive limit price; market orders must NOT have one
      CONSTRAINT limit_price_matches_type CHECK (
        (order_type = 'limit'  AND limit_price IS NOT NULL AND limit_price > 0) OR
        (order_type = 'market' AND limit_price IS NULL)
      ),
      -- the same user sending the same key twice is a duplicate submission
      CONSTRAINT orders_idempotency_unique UNIQUE (user_id, idempotency_key)
    );
    CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);
    CREATE INDEX orders_open_idx ON orders (status) WHERE status IN ('pending', 'processing');
  `);
};
export const down = (pgm) => {
  pgm.sql('DROP TABLE orders;');
};
