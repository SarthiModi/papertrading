import { query } from '../db/pool.js';
import { ApiError } from '../utils/apiResponse.js';
import { getQuotes, getMarketStatus } from './marketData/marketDataService.js';

export async function findStockBySymbol(symbol, client = { query }) {
  const { rows } = await client.query(
    'SELECT id, symbol, company_name, exchange FROM stocks WHERE symbol = $1',
    [symbol]
  );
  if (!rows[0]) throw new ApiError(404, 'STOCK_NOT_FOUND', `Unknown stock symbol: ${symbol}`);
  return rows[0];
}

function present(stock, quote) {
  return {
    symbol: stock.symbol,
    companyName: stock.company_name,
    exchange: stock.exchange,
    quote, // null means "unavailable"; quote.status is "fresh" or "stale"
  };
}

export async function listStocks(search) {
  const { rows } = search
    ? await query(
        `SELECT id, symbol, company_name, exchange FROM stocks
         WHERE symbol ILIKE $1 OR company_name ILIKE $1 ORDER BY symbol`,
        [`%${search}%`]
      )
    : await query('SELECT id, symbol, company_name, exchange FROM stocks ORDER BY symbol');
  const quotes = await getQuotes(rows.map((r) => r.symbol));
  return { stocks: rows.map((s) => present(s, quotes[s.symbol])), market: await getMarketStatus() };
}

export async function getStock(symbol) {
  const stock = await findStockBySymbol(symbol);
  const quotes = await getQuotes([symbol]);
  return { stock: present(stock, quotes[symbol]), market: await getMarketStatus() };
}

// History = OUR OWN periodic snapshots (price_history table), not a provider chart endpoint.
export async function getHistory(symbol, limit) {
  const stock = await findStockBySymbol(symbol);
  const { rows } = await query(
    `SELECT price, source_timestamp, data_source FROM (
       SELECT price, source_timestamp, data_source FROM price_history
       WHERE stock_id = $1 ORDER BY source_timestamp DESC LIMIT $2
     ) recent ORDER BY source_timestamp ASC`,
    [stock.id, limit]
  );
  return {
    symbol,
    points: rows.map((r) => ({ price: r.price, timestamp: r.source_timestamp, source: r.data_source })),
  };
}
