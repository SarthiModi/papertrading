// Runs an access pattern (e.g. which stock symbols users look at) through an LRU or LFU cache
// with a small capacity, and records every hit / miss / eviction.
// Clearly an EDUCATIONAL simulation: the real quote cache is Redis (which has its own eviction).
import { LRUCache } from './lruCache.js';
import { LFUCache } from './lfuCache.js';

export function runCacheDemo(policy, capacity, sequence) {
  const cache = policy === 'lfu' ? new LFUCache(capacity) : new LRUCache(capacity);
  const steps = [];
  for (const key of sequence) {
    const found = cache.get(key) !== undefined;
    let evicted = null;
    if (!found) evicted = cache.set(key, `quote-for-${key}`); // miss => "fetch from API" and store
    steps.push({ key, result: found ? 'hit' : 'miss', evicted, cacheNow: cache.keys() });
  }
  return { stats: cache.stats(), steps };
}
