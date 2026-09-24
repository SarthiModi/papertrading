
import { randomUUID } from 'node:crypto';
import { config } from '../src/config/env.js';
import { pool, query } from '../src/db/pool.js';
import { redis } from '../src/redis/client.js';
import { registerUser } from '../src/services/authService.js';
import { placeOrder } from '../src/services/orderService.js';
import { refreshQuote } from '../src/services/marketData/marketDataService.js';
import { simulatedProvider } from '../src/services/marketData/providers.js';
import { resetQueue, queueStats, recentClaims } from '../src/queue/redisQueue.js';
import { startWorkers } from '../src/workers/orderWorker.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : fallback; };
const orders = Number(arg('orders', 40));
const workers = Number(arg('workers', 2));
const mode = arg('mode', 'fcfs');
const userCount = Number(arg('users', 8)); // orders of ONE user queue on that user's account row lock, so we spread them
config.queue.schedulerMode = mode;

await resetQueue();
await refreshQuote('AAPL', simulatedProvider);
const users = [];
for (let i = 0; i < userCount; i += 1) {
  const u = await registerUser({ name: `Load Demo ${i}`, email: `load-${Date.now()}-${i}@example.com`, password: 'password123' });
  await query('UPDATE user_accounts SET available_balance = 10000000 WHERE user_id = $1', [u.id]);
  users.push(u);
}
const userIds = users.map((u) => u.id);

console.log(`PRODUCERS: placing ${orders} orders from ${userCount} users (every 4th is HIGH priority), scheduler=${mode}, workers=${workers}`);
const started = Date.now();
// Place first, THEN start workers, so the queue builds up and the scheduling policy has something to choose from.
const placed = [];
for (let i = 0; i < orders; i += 1) {
  placed.push(await placeOrder(users[i % userCount].id, { symbol: 'AAPL', side: 'buy', orderType: 'market', quantity: 1, priority: i % 4 === 3 ? 2 : 1, idempotencyKey: randomUUID() }));
}
console.log(`  queue depth right after producing: ${JSON.stringify(await queueStats())}`);

const stop = startWorkers(workers);
const processingStart = Date.now();
for (;;) {
  const { rows } = await query("SELECT count(*)::int AS open FROM orders WHERE user_id = ANY($1) AND status IN ('pending','processing')", [userIds]);
  if (rows[0].open === 0) break;
  await new Promise((r) => setTimeout(r, 50));
}
const processingMs = Date.now() - processingStart;
await stop();

const stats = await queueStats();
const claims = (await recentClaims(200)).reverse(); // oldest first = the order workers received jobs
console.log(`CONSUMERS (${workers} worker loop(s)):`);
console.log(`  processed ${stats.totalCompleted} orders in ${processingMs} ms  ->  ${(stats.totalCompleted / (processingMs / 1000)).toFixed(1)} orders/sec`);
console.log(`  average time a job waited in the queue: ${stats.averageWaitMs} ms   (total run ${Date.now() - started} ms)`);
console.log(`  all ${claims.length} jobs in the order workers received them (#arrival-number):`);
console.log('   ' + claims.map((c) => `#${c.seq}${c.priority === 2 ? '*' : ''}`).join(' ') + '    (* = high priority)');
const check = await query(`SELECT (SELECT count(*) FROM transactions WHERE user_id = ANY($1))::int AS fills,
  (SELECT COALESCE(SUM(quantity), 0) FROM holdings WHERE user_id = ANY($1))::int AS shares`, [userIds]);
console.log(`DATABASE CHECK: ${check.rows[0].fills} executions, ${check.rows[0].shares} shares (expected ${orders}/${orders}) -> ${check.rows[0].fills === orders && check.rows[0].shares === orders ? 'CORRECT' : 'MISMATCH'}`);
await query('DELETE FROM users WHERE id = ANY($1)', [userIds]).catch(() => {}); // clean up demo users (fails harmlessly if FK history exists)

await pool.end();
redis.disconnect();