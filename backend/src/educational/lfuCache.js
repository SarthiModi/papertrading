// EDUCATIONAL: Least Frequently Used cache. When full, evict the item used the FEWEST times.
// Ties (same count) are broken by evicting the one used longest ago.
// Eviction scans all entries (O(n)). Real LFU implementations use frequency buckets for O(1);
// we keep the simple version because n is tiny and clarity matters more here.
export class LFUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.entries = new Map(); // key -> { value, freq, lastUsed }
    this.tick = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    entry.freq += 1;
    entry.lastUsed = ++this.tick;
    this.hits += 1;
    return entry.value;
  }

  set(key, value) {
    const existing = this.entries.get(key);
    if (existing) {
      existing.value = value;
      existing.freq += 1;
      existing.lastUsed = ++this.tick;
      return null;
    }
    let evicted = null;
    if (this.entries.size >= this.capacity) {
      for (const [k, e] of this.entries) {
        const current = evicted === null ? null : this.entries.get(evicted);
        if (current === null || e.freq < current.freq || (e.freq === current.freq && e.lastUsed < current.lastUsed)) {
          evicted = k;
        }
      }
      this.entries.delete(evicted);
      this.evictions += 1;
    }
    this.entries.set(key, { value, freq: 1, lastUsed: ++this.tick });
    return evicted;
  }

  keys() {
    return [...this.entries.keys()];
  }

  stats() {
    const total = this.hits + this.misses;
    return { policy: 'LFU', capacity: this.capacity, size: this.entries.size, hits: this.hits, misses: this.misses, evictions: this.evictions, hitRate: total ? Math.round((this.hits / total) * 100) / 100 : 0 };
  }
}
