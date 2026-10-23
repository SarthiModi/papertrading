// src/modules/watchlist/watchlist.service.js
// Business logic for user stock watchlists (M:N relationship).
//
// ─── CACHING STRATEGY ─────────────────────────────────────────────────────────
//
//  LRU (Least Recently Used) CACHE — for watchlist data
//  ─────────────────────────────────────────────────────
//  When a user fetches their watchlist, we cache the result in Redis
//  with a TTL (e.g., 60 seconds). The next request is served from cache
//  instead of hitting PostgreSQL.
//
//  KEY:  paperbull:watchlist:<userId>
//  TYPE: Redis string (JSON-encoded list)
//  TTL:  60 seconds
//
//  LRU behaviour: Redis implements LRU eviction internally when memory
//  is under pressure (maxmemory-policy = allkeys-lru). Our TTL ensures
//  stale data is never served beyond 60s — a manually enforced recency policy.
//
//  CACHE INVALIDATION: Whenever a user adds/removes from watchlist, we
//  DELETE their cache key. This ensures they always see fresh data after
//  a mutation. This is the "write-invalidate" strategy.
//
//  LFU (Least Frequently Used) TRACKER — for "Most Watched" stocks
//  ────────────────────────────────────────────────────────────────
//  Every time ANY user adds a stock to their watchlist, we increment
//  a Redis Sorted Set score for that stock symbol.
//
//  KEY:  paperbull:watchlist:popularity    (sorted set)
//  MEMBER: stock symbol (e.g. "TCS")
//  SCORE: number of times ever added to any user's watchlist
//
//  LFU behaviour: Sorted Set stores (symbol → frequency). We can query
//  ZREVRANGE to get most popular stocks. Stocks added infrequently have
//  low scores — in a real system these would be evicted first (LFU eviction).
//
//  WHY both?
//  LRU = performance (avoid repeated DB reads for same data)
//  LFU = analytics (which stocks are most popular across all users)
// ──────────────────────────────────────────────────────────────────────────────

import pool from "../../config/db.js";
import { redis } from "../../config/redis.js";
import { ApiError } from "../../utils/ApiError.js";

// ── Cache key helpers ──────────────────────────────────────────────────────────
const WATCHLIST_CACHE_KEY  = (userId)  => `paperbull:watchlist:${userId}`;
const POPULARITY_KEY       = "paperbull:watchlist:popularity"; // LFU sorted set
const CACHE_TTL_SECONDS    = 60;  // LRU TTL: data stays "recent" for 60 seconds

// ── getWatchlist ───────────────────────────────────────────────────────────────
// LRU cache-aside pattern:
//   1. Check Redis cache first (cache HIT → return immediately)
//   2. On cache MISS → query PostgreSQL → store result in cache → return
const getWatchlist = async (userId) => {
  const cacheKey = WATCHLIST_CACHE_KEY(userId);

  // ── LRU Step 1: Check cache ───────────────────────────────────────────────
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log(`[Watchlist] LRU cache HIT for user ${userId.slice(0, 8)}...`);
    return JSON.parse(cached);  // Return from cache, skip DB query entirely
  }

  // ── LRU Step 2: Cache miss — go to PostgreSQL ─────────────────────────────
  console.log(`[Watchlist] LRU cache MISS for user ${userId.slice(0, 8)}... querying DB`);
  const result = await pool.query(
    `SELECT
       s.id          AS stock_id,
       s.symbol,
       s.company_name,
       s.current_price,
       w.created_at  AS added_at
     FROM watchlist w
     JOIN stocks s ON s.id = w.stock_id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId]
  );

  // ── LRU Step 3: Store in cache with TTL ───────────────────────────────────
  // SETEX = SET with EXpiry. After 60s Redis automatically evicts this key.
  // If Redis is under memory pressure, allkeys-lru policy evicts the LEAST
  // RECENTLY USED key — so inactive users' caches go first.
  await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result.rows));

  return result.rows;
};

// ── addToWatchlist ─────────────────────────────────────────────────────────────
// Also:
//   • Invalidates LRU cache for this user (write-invalidate strategy)
//   • Increments LFU popularity score for the stock symbol
const addToWatchlist = async (userId, symbol) => {
  const upperSymbol = symbol.toUpperCase();

  const stockRes = await pool.query(
    "SELECT id, symbol, company_name, current_price FROM stocks WHERE symbol = $1 AND is_active = true",
    [upperSymbol]
  );

  if (stockRes.rowCount === 0) {
    throw new ApiError(404, `Stock '${upperSymbol}' not found`);
  }

  const stock = stockRes.rows[0];

  await pool.query(
    `INSERT INTO watchlist (user_id, stock_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, stock_id) DO NOTHING`,
    [userId, stock.id]
  );

  // ── LRU: Invalidate this user's watchlist cache ───────────────────────────
  // Why delete instead of update? Simpler and safer.
  // Next GET will re-fetch fresh data and re-populate the cache.
  await redis.del(WATCHLIST_CACHE_KEY(userId));
  console.log(`[Watchlist] LRU cache INVALIDATED for user ${userId.slice(0, 8)}...`);

  // ── LFU: Increment popularity score for this symbol ───────────────────────
  // ZINCRBY increments the score of a member in a sorted set.
  // Key: popularity sorted set | Increment: 1 | Member: symbol
  // This tracks HOW MANY TIMES each stock has been added across ALL users.
  await redis.zincrby(POPULARITY_KEY, 1, upperSymbol);
  console.log(`[Watchlist] LFU score incremented for ${upperSymbol}`);

  return stock;
};

// ── removeFromWatchlist ────────────────────────────────────────────────────────
// Invalidates LRU cache. Does NOT decrement LFU (frequency = ever added, not
// current count — this is intentional, like YouTube view count never goes down).
const removeFromWatchlist = async (userId, stockId) => {
  const result = await pool.query(
    "DELETE FROM watchlist WHERE user_id = $1 AND stock_id = $2 RETURNING stock_id",
    [userId, stockId]
  );

  if (result.rowCount === 0) {
    throw new ApiError(404, "Stock not found in your watchlist");
  }

  // ── LRU: Invalidate cache on removal too ─────────────────────────────────
  await redis.del(WATCHLIST_CACHE_KEY(userId));
  console.log(`[Watchlist] LRU cache INVALIDATED for user ${userId.slice(0, 8)}... (removal)`);

  return { stockId };
};

// ── getMostWatched ─────────────────────────────────────────────────────────────
// LFU-based leaderboard: returns top N most-added stocks across all users.
// Uses ZREVRANGE (Sorted Set Reverse Range) — highest score first.
//
// This is exactly LFU in action:
//   Score = frequency of use = number of times added to any watchlist
//   Returned in descending order = most frequently "used" first
const getMostWatched = async (limit = 5) => {
  // ZREVRANGE key start stop WITHSCORES
  // Returns [ symbol, score, symbol, score, ... ]
  const raw = await redis.zrevrange(POPULARITY_KEY, 0, limit - 1, "WITHSCORES");

  // Convert flat array [ "TCS", "42", "INFY", "31", ... ] to objects
  const result = [];
  for (let i = 0; i < raw.length; i += 2) {
    result.push({
      symbol:    raw[i],
      watchCount: Number(raw[i + 1]),
    });
  }

  return result;
};

export { getWatchlist, addToWatchlist, removeFromWatchlist, getMostWatched };
