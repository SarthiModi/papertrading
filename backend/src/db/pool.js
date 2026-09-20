// PostgreSQL connection pool.
// A pool keeps several open connections and lends one to each query.
// This is what lets many requests talk to the database at the same time.
import pg from 'pg';
import { config } from '../config/env.js';

// NOTE: pg returns NUMERIC columns as strings. We KEEP that on purpose:
// converting money to JavaScript floats would reintroduce rounding errors.
export const pool = new pg.Pool({
  ...config.db,
  max: 10,
  idleTimeoutMillis: 30000,
});

// Without this handler an idle-connection error would crash the process.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

export async function query(text, params) {
  return pool.query(text, params);
}

// Runs `work(client)` inside BEGIN ... COMMIT. If anything throws -> ROLLBACK.
// All money-moving code in later phases uses this helper.
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release(); // ALWAYS give the connection back to the pool
  }
}

// DEADLOCKS: if two transactions each wait for a row the other holds, PostgreSQL kills one of them
// (error 40P01). 40001 = serialization failure. Both are SAFE to retry because the whole
// transaction was rolled back. We retry a few times with a small random pause.
export async function retryOnConflict(work, attempts = 3) {
  for (let i = 0; ; i += 1) {
    try {
      return await work();
    } catch (err) {
      const retryable = err.code === '40P01' || err.code === '40001';
      if (!retryable || i >= attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60 * (i + 1)));
    }
  }
}
