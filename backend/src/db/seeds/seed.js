// Inserts stock metadata (symbol, company name, exchange). NO prices: those come from the API.
// Safe to run many times: ON CONFLICT DO NOTHING skips rows that already exist.
import { pool } from '../pool.js';

const STOCKS = [
  ['AAPL', 'Apple Inc.', 'NASDAQ'],
  ['MSFT', 'Microsoft Corporation', 'NASDAQ'],
  ['GOOGL', 'Alphabet Inc. (Class A)', 'NASDAQ'],
  ['AMZN', 'Amazon.com, Inc.', 'NASDAQ'],
  ['NVDA', 'NVIDIA Corporation', 'NASDAQ'],
  ['META', 'Meta Platforms, Inc.', 'NASDAQ'],
  ['TSLA', 'Tesla, Inc.', 'NASDAQ'],
  ['JPM', 'JPMorgan Chase & Co.', 'NYSE'],
  ['KO', 'The Coca-Cola Company', 'NYSE'],
  ['DIS', 'The Walt Disney Company', 'NYSE'],
];

for (const [symbol, name, exchange] of STOCKS) {
  await pool.query(
    `INSERT INTO stocks (symbol, company_name, exchange)
     VALUES ($1, $2, $3)
     ON CONFLICT (symbol, exchange) DO NOTHING`,
    [symbol, name, exchange]
  );
}
const { rows } = await pool.query('SELECT count(*) FROM stocks');
console.log(`Seed done. stocks table now has ${rows[0].count} rows.`);
await pool.end();
