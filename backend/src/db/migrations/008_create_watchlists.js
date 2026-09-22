export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE watchlists (
      user_id     BIGINT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
      stock_id    BIGINT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, stock_id)   -- prevents duplicates
    );
  `);
};
export const down = (pgm) => {
  pgm.sql('DROP TABLE watchlists;');
};
