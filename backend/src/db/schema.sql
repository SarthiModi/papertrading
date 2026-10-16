-- =============================================================
--  PaperBull - PostgreSQL Schema
--  PostgreSQL 15+ compatible
-- =============================================================
--
-- DESIGN PHILOSOPHY:
-- Every constraint here is intentional. They prevent bad data at the
-- DB level regardless of what the application layer does.
-- This is the last line of defense for data integrity.
--
-- ACID reminder:
-- Atomicity  → transactions (BEGIN/COMMIT/ROLLBACK)
-- Consistency → constraints, foreign keys, check constraints
-- Isolation   → row-level locking (FOR UPDATE)
-- Durability  → PostgreSQL WAL (write-ahead log) — handled automatically
-- =============================================================

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- =============================================================
-- 1. USERS
-- =============================================================
-- balance: virtual cash available for trading.
-- WHY NUMERIC(15,2)? Avoids floating-point precision issues.
-- ₹99,999,999,999,999.99 max — more than enough.
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  name          VARCHAR(50)   NOT NULL,
  email         VARCHAR(100)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  balance       NUMERIC(15,2) NOT NULL DEFAULT 100000.00,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_balance_non_negative CHECK (balance >= 0)
);

-- Index: login lookup by email (most common user query)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);


-- =============================================================
-- 2. STOCKS
-- =============================================================
-- Represents tradable instruments. Prices are simulated.
-- WHY is_active? Instead of deleting stocks, we deactivate them.
-- This preserves historical trade/order data integrity.
-- =============================================================

CREATE TABLE IF NOT EXISTS stocks (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol        VARCHAR(20)   NOT NULL,
  company_name  VARCHAR(100)  NOT NULL,
  current_price NUMERIC(15,2) NOT NULL,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT stocks_symbol_unique UNIQUE (symbol),
  CONSTRAINT stocks_price_positive CHECK (current_price > 0)
);

-- Index: most market queries filter/sort by symbol
CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol);
CREATE INDEX IF NOT EXISTS idx_stocks_active ON stocks(is_active);


-- =============================================================
-- 3. PRICE HISTORY
-- =============================================================
-- Records price snapshots over time. Used for charts.
-- WHY separate table? current_price on stocks is just the latest value.
-- History allows us to draw a price chart and calculate volatility.
-- =============================================================

CREATE TABLE IF NOT EXISTS price_history (
  id         BIGSERIAL     PRIMARY KEY,
  stock_id   UUID          NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  price      NUMERIC(15,2) NOT NULL,
  recorded_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT price_history_price_positive CHECK (price > 0)
);

-- Index: fetching history for a stock ordered by time (chart queries)
CREATE INDEX IF NOT EXISTS idx_price_history_stock_time
  ON price_history(stock_id, recorded_at DESC);


-- =============================================================
-- 4. WATCHLIST
-- =============================================================
-- M:N relationship between users and stocks.
-- A user can watch many stocks; a stock can be watched by many users.
-- =============================================================

CREATE TABLE IF NOT EXISTS watchlist (
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stock_id   UUID        NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, stock_id)
);

-- Index: "get all watchlist items for user X"
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);


-- =============================================================
-- 5. ORDERS
-- =============================================================
-- An order = user's INTENTION to buy or sell.
-- It does NOT mean the trade has happened yet.
--
-- ORDER LIFECYCLE:
-- PENDING → (PROCESSING) → PARTIALLY_FILLED → FILLED
--                       ↘ CANCELLED / REJECTED
--
-- remaining_quantity tracks how much is left to fill.
-- For a fresh order: remaining_quantity = quantity
-- After partial fill:  remaining_quantity < quantity
-- After full fill:     remaining_quantity = 0, status = FILLED
--
-- WHY store filled_price separately from price?
-- For MARKET orders, the user doesn't specify a price.
-- filled_price is the actual average price at which it executed.
-- =============================================================

CREATE TYPE order_side   AS ENUM ('BUY', 'SELL');
CREATE TYPE order_type   AS ENUM ('MARKET', 'LIMIT');
CREATE TYPE order_status AS ENUM (
  'PENDING', 'PROCESSING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED'
);

CREATE TABLE IF NOT EXISTS orders (
  id                  UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stock_id            UUID         NOT NULL REFERENCES stocks(id),
  side                order_side   NOT NULL,
  order_type          order_type   NOT NULL,
  quantity            INTEGER      NOT NULL,
  price               NUMERIC(15,2),           -- NULL for MARKET orders
  remaining_quantity  INTEGER      NOT NULL,
  status              order_status NOT NULL DEFAULT 'PENDING',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT orders_quantity_positive        CHECK (quantity > 0),
  CONSTRAINT orders_remaining_valid          CHECK (remaining_quantity >= 0 AND remaining_quantity <= quantity),
  CONSTRAINT orders_limit_price_required     CHECK (order_type = 'MARKET' OR price IS NOT NULL),
  CONSTRAINT orders_limit_price_positive     CHECK (price IS NULL OR price > 0)
);

-- Indexes: most order queries filter by these
-- WHY index status? Workers query "WHERE status = 'PENDING'" constantly.
-- WHY composite (stock_id, side, status)? The matching engine queries:
-- "Give me all PENDING SELL orders for stock X" — this index serves that.
CREATE INDEX IF NOT EXISTS idx_orders_user       ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_stock      ON orders(stock_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_matching
  ON orders(stock_id, side, status, price, created_at);


-- =============================================================
-- 6. TRADES
-- =============================================================
-- A trade = what ACTUALLY HAPPENED in the market.
-- 1 Order can produce multiple Trades (partial fills).
--
-- buy_order_id / sell_order_id: which orders got matched.
-- price: the actual execution price (may differ from limit price).
-- quantity: how many shares changed hands in THIS trade.
--
-- WHY store both buyer and seller?
-- Real matching: one BUY order matches against one SELL order.
-- Storing both sides gives us full audit trail.
-- =============================================================

CREATE TABLE IF NOT EXISTS trades (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id      UUID          NOT NULL REFERENCES stocks(id),
  buy_order_id  UUID          NOT NULL REFERENCES orders(id),
  sell_order_id UUID          NOT NULL REFERENCES orders(id),
  buyer_id      UUID          NOT NULL REFERENCES users(id),
  seller_id     UUID          NOT NULL REFERENCES users(id),
  quantity      INTEGER       NOT NULL,
  price         NUMERIC(15,2) NOT NULL,
  executed_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT trades_quantity_positive CHECK (quantity > 0),
  CONSTRAINT trades_price_positive    CHECK (price > 0)
);

-- Indexes: trade history lookups are frequent for portfolio/P&L
CREATE INDEX IF NOT EXISTS idx_trades_buyer     ON trades(buyer_id);
CREATE INDEX IF NOT EXISTS idx_trades_seller    ON trades(seller_id);
CREATE INDEX IF NOT EXISTS idx_trades_stock     ON trades(stock_id);
CREATE INDEX IF NOT EXISTS idx_trades_time      ON trades(executed_at DESC);


-- =============================================================
-- 7. TRANSACTIONS
-- =============================================================
-- Financial movement resulting from a trade execution.
-- Each trade creates 2 transactions:
-- 1. DEBIT  for the buyer  (money leaves)
-- 2. CREDIT for the seller (money arrives)
--
-- WHY keep this separate from trades?
-- Trades describe market events. Transactions describe account events.
-- This mirrors how real banking works (trade ≠ settlement).
-- =============================================================

CREATE TYPE transaction_type AS ENUM ('CREDIT', 'DEBIT');

CREATE TABLE IF NOT EXISTS transactions (
  id         UUID             DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id   UUID             NOT NULL REFERENCES trades(id),
  type       transaction_type NOT NULL,
  amount     NUMERIC(15,2)    NOT NULL,
  created_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT transactions_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_trade ON transactions(trade_id);


-- =============================================================
-- 8. HOLDINGS
-- =============================================================
-- What a user currently owns.
-- Updated ONLY after a trade executes — not when an order is placed.
--
-- average_buy_price: used for unrealized P&L calculation.
-- Formula: ((old_qty * old_avg) + (new_qty * new_price)) / (old_qty + new_qty)
--
-- When quantity reaches 0, we can either delete the row or keep it.
-- Keeping it (with quantity=0) is simpler and preserves history.
-- =============================================================

CREATE TABLE IF NOT EXISTS holdings (
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stock_id         UUID          NOT NULL REFERENCES stocks(id),
  quantity         INTEGER       NOT NULL DEFAULT 0,
  average_buy_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, stock_id),
  CONSTRAINT holdings_quantity_non_negative CHECK (quantity >= 0)
);

-- Index: "get all holdings for user X" (portfolio page)
CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);


-- =============================================================
-- SEED DATA: Initial stocks
-- =============================================================
-- These are popular NSE stocks used as simulation instruments.
-- Prices are starting values; the price engine will update them.
-- =============================================================

INSERT INTO stocks (symbol, company_name, current_price) VALUES
  ('RELIANCE',  'Reliance Industries Ltd',   2850.00),
  ('TCS',       'Tata Consultancy Services',  4020.00),
  ('INFY',      'Infosys Ltd',               1780.00),
  ('HDFCBANK',  'HDFC Bank Ltd',             1620.00),
  ('ICICIBANK', 'ICICI Bank Ltd',             1150.00),
  ('WIPRO',     'Wipro Ltd',                  530.00),
  ('SBIN',      'State Bank of India',        830.00),
  ('BAJFINANCE','Bajaj Finance Ltd',         7200.00),
  ('MARUTI',    'Maruti Suzuki India Ltd',  12500.00),
  ('TATAMOTORS','Tata Motors Ltd',            960.00)
ON CONFLICT (symbol) DO NOTHING;


-- =============================================================
-- VIEW: portfolio_view
-- =============================================================
-- A SQL VIEW is a "virtual table" — it stores no data itself.
-- Every time you SELECT from it, it re-runs the underlying query.
--
-- WHY a VIEW here?
-- Portfolio value = cash balance + market value of all holdings.
-- This is a DERIVED value — storing it directly would violate 3NF
-- (it would be transitive: portfolio depends on balance and prices,
--  not directly on user_id alone).
--
-- So instead of storing it, we create a VIEW that computes it
-- dynamically from the actual source-of-truth tables.
--
-- EXTERNAL SCHEMA: This view IS the external schema for portfolio data.
-- Users of this view don't need to know about the underlying JOIN.
-- They just SELECT from portfolio_view.
--
-- DATA INDEPENDENCE: If we change how holdings or balance works,
-- we only update this view — application queries stay the same.
-- =============================================================

CREATE OR REPLACE VIEW portfolio_view AS
SELECT
  u.id                                                              AS user_id,
  u.name,
  u.email,
  u.balance                                                         AS cash_balance,
  COALESCE(SUM(h.quantity * s.current_price), 0)                   AS holdings_value,
  u.balance + COALESCE(SUM(h.quantity * s.current_price), 0)       AS total_portfolio_value,
  COALESCE(SUM(h.quantity * (s.current_price - h.average_buy_price)), 0) AS total_unrealized_pnl,
  COUNT(h.stock_id)                                                 AS stocks_held
FROM users u
LEFT JOIN holdings h  ON h.user_id  = u.id AND h.quantity > 0
LEFT JOIN stocks   s  ON s.id       = h.stock_id
GROUP BY u.id, u.name, u.email, u.balance;
