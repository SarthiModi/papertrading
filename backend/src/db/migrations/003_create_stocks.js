// Stock METADATA only. Prices change constantly and come from the market-data API (cached in Redis).
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE stocks (
      id            BIGSERIAL PRIMARY KEY,
      symbol        VARCHAR(20)  NOT NULL,
      company_name  VARCHAR(150) NOT NULL,
      exchange      VARCHAR(20)  NOT NULL,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
      UNIQUE (symbol, exchange)
    );
  `);
};
export const down = (pgm) => {
  pgm.sql('DROP TABLE stocks;');
};
