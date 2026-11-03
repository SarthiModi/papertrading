// src/modules/stocks/stocks.service.js
// Business logic for the stocks module.
// All queries here are READ-ONLY — stocks are seeded via schema.sql.
// The price engine (Step 14) will update current_price periodically.

import pool from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";

// -----------------------------------------------------------
// getAllStocks()
// Returns all active stocks with their current price.
// Used on the market listing page.
//
// WHY filter is_active = true?
// We never DELETE stocks (would break historical trade/order records).
// We just mark them inactive. Active = currently tradable.
// -----------------------------------------------------------
const getAllStocks = async () => {
  const result = await pool.query(
    `SELECT id, symbol, company_name, current_price, updated_at
     FROM stocks
     WHERE is_active = true
     ORDER BY symbol ASC`
  );
  return result.rows;
};

// -----------------------------------------------------------
// getStockBySymbol(symbol)
// Returns one stock + last 50 price history points.
// Used on the stock detail page (chart + order placement).
//
// WHY 50 history points?
// Enough for a simple sparkline/chart without over-fetching.
// We'll increase this when the chart UI is built.
// -----------------------------------------------------------
const getStockBySymbol = async (symbol) => {
  // Normalize: always uppercase so 'tcs' and 'TCS' both work
  const upperSymbol = symbol.toUpperCase();

  const stockResult = await pool.query(
    `SELECT id, symbol, company_name, current_price, updated_at
     FROM stocks
     WHERE symbol = $1 AND is_active = true`,
    [upperSymbol]
  );

  if (stockResult.rowCount === 0) {
    throw new ApiError(404, `Stock '${upperSymbol}' not found`);
  }

  const stock = stockResult.rows[0];

  // Fetch recent price history for this stock
  const historyResult = await pool.query(
    `SELECT price, recorded_at
     FROM price_history
     WHERE stock_id = $1
     ORDER BY recorded_at DESC
     LIMIT 50`,
    [stock.id]
  );

  // Reverse so chart renders left (oldest) → right (newest)
  const priceHistory = historyResult.rows.reverse();

  return { ...stock, priceHistory };
};

// -----------------------------------------------------------
// getTopTradedStocks(limit = 5)
// Computes top traded stocks based on actual executed trade volume (DBMS aggregation).
// -----------------------------------------------------------
const getTopTradedStocks = async (limit = 5) => {
  const result = await pool.query(
    `SELECT
       s.id,
       s.symbol,
       s.company_name,
       s.current_price,
       COALESCE(SUM(t.quantity), 0)::INTEGER AS total_traded_volume,
       COUNT(t.id)::INTEGER AS total_trades_count
     FROM stocks s
     LEFT JOIN trades t ON t.stock_id = s.id
     WHERE s.is_active = true
     GROUP BY s.id, s.symbol, s.company_name, s.current_price
     ORDER BY total_traded_volume DESC, total_trades_count DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

// -----------------------------------------------------------
// getCandles(stockId, intervalSeconds, limit)
// Aggregates price_history ticks into OHLC candlestick data.
//
// OHLC = Open, High, Low, Close — the 4 prices per time bucket.
//   Open  = first price in the bucket (what it was at start)
//   High  = max price in the bucket
//   Low   = min price in the bucket
//   Close = last price in the bucket (what it was at end)
//
// WHY SQL CTEs and DISTINCT ON here?
//   PostgreSQL doesn't have FIRST() / LAST() aggregate functions.
//   We use DISTINCT ON (bucket) ORDER BY bucket, recorded_at ASC to get
//   the first price in each bucket (Open), and DESC for Close.
//
// DBMS concepts: GROUP BY aggregation, CTEs (WITH), DISTINCT ON,
//   date/time functions (to_timestamp, floor, extract), window into
//   historical data with parameterized intervals.
// -----------------------------------------------------------
const getCandles = async (stockId, intervalSeconds = 60, limit = 80) => {
  // Build the OHLC query using 3 CTEs:
  //   ticks       → raw rows with their bucket label
  //   first_price → DISTINCT ON gets first tick per bucket (= Open)
  //   last_price  → DISTINCT ON gets last  tick per bucket (= Close)
  // Then JOIN all three with the aggregate (High, Low, count) query.
  //
  // NOTE on INTERVAL construction:
  //   We use make_interval(secs => ...) which accepts a numeric expression directly.
  //   This avoids the string-concatenation trick ($2 * $3 || ' seconds')
  //   which PostgreSQL rejects because $2 is a typed numeric param.

  const result = await pool.query(
    `WITH ticks AS (
       SELECT
         price,
         recorded_at,
         to_timestamp(
           floor(extract(epoch FROM recorded_at) / $2) * $2
         ) AS bucket_time
       FROM price_history
       WHERE stock_id = $1
         AND recorded_at >= NOW() - make_interval(secs => ($2 * $3)::float)
     ),
     first_price AS (
       SELECT DISTINCT ON (bucket_time)
         bucket_time,
         price AS open,
         recorded_at
       FROM ticks
       ORDER BY bucket_time, recorded_at ASC
     ),
     last_price AS (
       SELECT DISTINCT ON (bucket_time)
         bucket_time,
         price AS close,
         recorded_at
       FROM ticks
       ORDER BY bucket_time, recorded_at DESC
     ),
     agg AS (
       SELECT
         bucket_time,
         MAX(price) AS high,
         MIN(price) AS low,
         COUNT(*)   AS tick_count
       FROM ticks
       GROUP BY bucket_time
     )
     SELECT
       a.bucket_time  AS time,
       f.open,
       a.high,
       a.low,
       l.close,
       a.tick_count
     FROM agg a
     JOIN first_price f ON f.bucket_time = a.bucket_time
     JOIN last_price  l ON l.bucket_time = a.bucket_time
     ORDER BY a.bucket_time ASC
     LIMIT $3`,
    [stockId, intervalSeconds, limit]
  );

  return result.rows;
};

export { getAllStocks, getStockBySymbol, getTopTradedStocks, getCandles };
