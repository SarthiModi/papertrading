// Periodic snapshots (default: every few minutes, NOT every second; see docs/database-design.md).
// data_source says where the price came from, so simulated prices can never pass as real ones.
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE price_history (
      id                BIGSERIAL PRIMARY KEY,
      stock_id          BIGINT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
      price             NUMERIC(18,4) NOT NULL CHECK (price > 0),
      source_timestamp  TIMESTAMPTZ NOT NULL,
      recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      data_source       VARCHAR(20) NOT NULL CHECK (data_source IN ('finnhub', 'simulated'))
    );
    CREATE INDEX price_history_stock_time_idx ON price_history (stock_id, source_timestamp DESC);
  `);
};
export const down = (pgm) => {
  pgm.sql('DROP TABLE price_history;');
};
