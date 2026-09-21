// A small RELIABLE job queue on Redis. (Why not BullMQ? Writing it ourselves shows how queues work.)
//
// Data structures (all keys start with pb:queue:):
//   ready      sorted set  jobs waiting; score decides order (see scheduler/schedulers.js)
//   processing sorted set  jobs a worker has claimed; score = deadline (when we give up on that worker)
//   delayed    sorted set  jobs waiting to retry; score = time they become ready again
//   jobs       hash        jobId -> payload JSON  (its existence = "this job is queued or in progress")
//   scores     hash        jobId -> score
//   attempts   hash        jobId -> how many times it has been claimed
//   dead       sorted set  jobs that failed too many times ("dead-letter" list); deadjobs holds payloads
//
// Every multi-step change is a LUA SCRIPT. Redis runs a script as ONE indivisible step, so two workers
// can never claim the same job, and a crash can never leave a job half-moved.
import { redis } from '../redis/client.js';
import { config } from '../config/env.js';
import { computeScore } from '../scheduler/schedulers.js';

const P = 'pb:queue:';
const KEYS = ['ready', 'processing', 'delayed', 'jobs', 'scores', 'attempts', 'dead', 'deadjobs'].map((k) => P + k);
const STATS_KEY = 'pb:stats';
const SEQ_KEY = P + 'seq';
const SCHED_LOG_KEY = 'pb:sched:log';

// KEYS[1]=ready [2]=processing [3]=delayed [4]=jobs [5]=scores [6]=attempts [7]=dead [8]=deadjobs
redis.defineCommand('pbEnqueue', {
  numberOfKeys: 8,
  lua: `
    if redis.call('HEXISTS', KEYS[4], ARGV[1]) == 1 then return 0 end   -- already queued/in progress: ignore
    redis.call('HSET', KEYS[4], ARGV[1], ARGV[2])
    redis.call('HSET', KEYS[5], ARGV[1], ARGV[3])
    redis.call('ZADD', KEYS[1], ARGV[3], ARGV[1])
    return 1`,
});

// ARGV[1]=now(ms) ARGV[2]=deadline(ms)
redis.defineCommand('pbClaim', {
  numberOfKeys: 8,
  lua: `
    local due = redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', ARGV[1])   -- retries whose wait is over
    for _, id in ipairs(due) do
      redis.call('ZREM', KEYS[3], id)
      redis.call('ZADD', KEYS[1], redis.call('HGET', KEYS[5], id), id)
    end
    local first = redis.call('ZRANGE', KEYS[1], 0, 0)                    -- lowest score = next job
    if #first == 0 then return false end
    local id = first[1]
    redis.call('ZREM', KEYS[1], id)
    redis.call('ZADD', KEYS[2], ARGV[2], id)                             -- now "owned" by a worker until deadline
    local attempts = redis.call('HINCRBY', KEYS[6], id, 1)
    return { id, redis.call('HGET', KEYS[4], id), tostring(attempts) }`,
});

redis.defineCommand('pbAck', {
  numberOfKeys: 8,
  lua: `
    redis.call('ZREM', KEYS[2], ARGV[1])
    redis.call('HDEL', KEYS[4], ARGV[1])
    redis.call('HDEL', KEYS[5], ARGV[1])
    redis.call('HDEL', KEYS[6], ARGV[1])
    return 1`,
});

// ARGV[1]=jobId ARGV[2]=runAt(ms) ARGV[3]=maxAttempts ARGV[4]=now(ms)
redis.defineCommand('pbNack', {
  numberOfKeys: 8,
  lua: `
    local attempts = tonumber(redis.call('HGET', KEYS[6], ARGV[1]) or '0')
    redis.call('ZREM', KEYS[2], ARGV[1])
    if attempts >= tonumber(ARGV[3]) then
      redis.call('HSET', KEYS[8], ARGV[1], redis.call('HGET', KEYS[4], ARGV[1]) or '')
      redis.call('ZADD', KEYS[7], ARGV[4], ARGV[1])
      redis.call('HDEL', KEYS[4], ARGV[1]); redis.call('HDEL', KEYS[5], ARGV[1]); redis.call('HDEL', KEYS[6], ARGV[1])
      return 'dead'
    end
    redis.call('ZADD', KEYS[3], ARGV[2], ARGV[1])
    return 'retry'`,
});

// Recovery of abandoned jobs: any job whose deadline passed belonged to a worker that crashed or hung.
// ARGV[1]=now(ms) ARGV[2]=maxAttempts. Returns { requeuedCount, deadId1, deadId2, ... }
redis.defineCommand('pbReap', {
  numberOfKeys: 8,
  lua: `
    local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
    local out = { 0 }
    for _, id in ipairs(expired) do
      redis.call('ZREM', KEYS[2], id)
      local attempts = tonumber(redis.call('HGET', KEYS[6], id) or '0')
      if attempts >= tonumber(ARGV[2]) then
        redis.call('HSET', KEYS[8], id, redis.call('HGET', KEYS[4], id) or '')
        redis.call('ZADD', KEYS[7], ARGV[1], id)
        redis.call('HDEL', KEYS[4], id); redis.call('HDEL', KEYS[5], id); redis.call('HDEL', KEYS[6], id)
        out[#out + 1] = id
      else
        redis.call('ZADD', KEYS[1], redis.call('HGET', KEYS[5], id), id)
        out[1] = out[1] + 1
      end
    end
    return out`,
});

export const jobIdForOrder = (orderId) => `order:${orderId}`;

// Producer side. Returns true if added, false if that order already has a job queued/in progress.
export async function enqueueJob(orderId, priority = 1, mode = config.queue.schedulerMode) {
  const seq = await redis.incr(SEQ_KEY); // arrival order
  const score = computeScore(mode, { priority, seq });
  const payload = JSON.stringify({ orderId: String(orderId), priority, seq, enqueuedAt: Date.now() });
  const added = await redis.pbEnqueue(...KEYS, jobIdForOrder(orderId), payload, String(score));
  if (added === 1) await redis.hincrby(STATS_KEY, 'enqueued', 1);
  return added === 1;
}

// Consumer side. Returns { jobId, payload, attempts } or null if nothing is ready.
export async function claimJob(visibilityMs = config.queue.visibilityTimeoutMs) {
  const now = Date.now();
  const result = await redis.pbClaim(...KEYS, String(now), String(now + visibilityMs));
  if (!result) return null;
  const [jobId, payloadText, attempts] = result;
  const payload = JSON.parse(payloadText);
  // Diagnostic log so the scheduler demo can show the real order jobs were handed out in.
  await redis
    .multi()
    .lpush(SCHED_LOG_KEY, JSON.stringify({ jobId, seq: payload.seq, priority: payload.priority, claimedAt: now }))
    .ltrim(SCHED_LOG_KEY, 0, 199)
    .exec();
  return { jobId, payload, attempts: Number(attempts) };
}

export const ackJob = (jobId) => redis.pbAck(...KEYS, jobId);

// Failed this time: retry later (after delayMs), or move to the dead list if attempts are used up.
export const nackJob = (jobId, delayMs, maxAttempts = config.queue.maxAttempts) =>
  redis.pbNack(...KEYS, jobId, String(Date.now() + delayMs), String(maxAttempts), String(Date.now()));

export async function reapExpired(maxAttempts = config.queue.maxAttempts) {
  const [requeued, ...deadJobIds] = await redis.pbReap(...KEYS, String(Date.now()), String(maxAttempts));
  return { requeued, deadJobIds };
}

export async function queueStats() {
  const [ready, processing, delayed, dead] = await Promise.all([
    redis.zcard(KEYS[0]), redis.zcard(KEYS[1]), redis.zcard(KEYS[2]), redis.zcard(KEYS[6]),
  ]);
  const stats = await redis.hgetall(STATS_KEY);
  const waitCount = Number(stats.waitCount || 0);
  return {
    ready, processing, delayed, dead,
    totalEnqueued: Number(stats.enqueued || 0),
    totalCompleted: Number(stats.completed || 0),
    averageWaitMs: waitCount ? Math.round(Number(stats.waitTotalMs || 0) / waitCount) : 0,
  };
}

export async function recordJobFinished(waitMs) {
  await redis.multi().hincrby(STATS_KEY, 'completed', 1).hincrby(STATS_KEY, 'waitTotalMs', Math.max(0, waitMs)).hincrby(STATS_KEY, 'waitCount', 1).exec();
}

export async function recentClaims(limit = 20) {
  const rows = await redis.lrange(SCHED_LOG_KEY, 0, limit - 1);
  return rows.map((r) => JSON.parse(r));
}

// Test/demo helper. Deletes ONLY queue + stats keys.
export async function resetQueue() {
  await redis.del(...KEYS, STATS_KEY, SEQ_KEY, SCHED_LOG_KEY);
}
