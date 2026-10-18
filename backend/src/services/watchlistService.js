import { query } from '../db/pool.js';
import { findStockBySymbol } from './stockService.js';
import { getQuotes } from './marketData/marketDataService.js';

export async function getWatchlist(userId) {
  const { rows } = await query(
    `SELECT s.symbol, s.company_name, s.exchange FROM watchlists w JOIN stocks s ON s.id = w.stock_id
     WHERE w.user_id = $1 ORDER BY s.symbol`, [userId]);
  const quotes = await getQuotes(rows.map((r) => r.symbol));
  return rows.map((r) => ({ symbol: r.symbol, companyName: r.company_name, exchange: r.exchange, quote: quotes[r.symbol] }));
}

export async function addToWatchlist(userId, symbol) {
  const stock = await findStockBySymbol(symbol);
  // The composite primary key (user_id, stock_id) prevents duplicates; DO NOTHING makes re-adding harmless.
  await query('INSERT INTO watchlists (user_id, stock_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, stock.id]);
}

export async function removeFromWatchlist(userId, symbol) {
  const stock = await findStockBySymbol(symbol);
  await query('DELETE FROM watchlists WHERE user_id = $1 AND stock_id = $2', [userId, stock.id]);
}
