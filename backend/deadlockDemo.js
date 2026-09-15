import { pool } from '../src/db/pool.js';
import { redis } from '../src/redis/client.js';
import { registerUser } from '../src/services/authService.js';

const stamp = Date.now();
const a = await registerUser({ name: 'Deadlock A', email: `dl-a-${stamp}@example.com`, password: 'password123' });
const b = await registerUser({ name: 'Deadlock B', email: `dl-b-${stamp}@example.com`, password: 'password123' });
const lock = (c, id, who) => c.query('SELECT 1 FROM user_accounts WHERE user_id = $1 FOR UPDATE', [id]).then(() => console.log(`  ${who} locked account ${id}`));

console.log('EXPERIMENT 1: opposite lock order (T1: A then B, T2: B then A)');
let [t1, t2] = [await pool.connect(), await pool.connect()];
await t1.query('BEGIN'); await t2.query('BEGIN');
await lock(t1, a.id, 'T1'); await lock(t2, b.id, 'T2');
console.log('  now T1 wants B and T2 wants A: each waits for the other...');
const results = await Promise.allSettled([lock(t1, b.id, 'T1'), lock(t2, a.id, 'T2')]);
results.forEach((r, i) => console.log(`  T${i + 1}: ${r.status === 'rejected' ? `ABORTED by PostgreSQL (${r.reason.code}: ${r.reason.message})` : 'continued'}`));
await t1.query('ROLLBACK'); await t2.query('ROLLBACK'); t1.release(); t2.release();

console.log('\nEXPERIMENT 2: same lock order for everyone (always the LOWER id first)');
[t1, t2] = [await pool.connect(), await pool.connect()];
await t1.query('BEGIN'); await t2.query('BEGIN');
const ordered = async (c, who) => { await lock(c, Math.min(a.id, b.id), who); await lock(c, Math.max(a.id, b.id), who); await c.query('COMMIT'); console.log(`  ${who} committed`); };
await Promise.all([ordered(t1, 'T1'), ordered(t2, 'T2')]);
t1.release(); t2.release();
console.log('  No deadlock: T2 simply waited for T1 to finish.');

await pool.query('DELETE FROM users WHERE id = ANY($1)', [[a.id, b.id]]);
await pool.end(); redis.disconnect();