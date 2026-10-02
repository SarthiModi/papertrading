// EDUCATIONAL: Least Recently Used cache. When full, evict the item that was used LONGEST AGO.
// Implementation note: a JavaScript Map remembers insertion order, so "delete then set again"
// moves a key to the end (= most recent). The first key in the Map is always the least recently used.
// (A textbook version uses a hash map + doubly linked list; the Map does the same job more simply.)
export class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  get(key) {
    if (!this.map.has(key)) {
      this.misses += 1;
      return undefined;
    }
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value); // move to "most recent"
    this.hits += 1;
    return value;
  }

  // Returns the evicted key (or null).
  set(key, value) {
    let evicted = null;
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      evicted = this.map.keys().next().value; // least recently used
      this.map.delete(evicted);
      this.evictions += 1;
    }
    this.map.set(key, value);
    return evicted;
  }

  keys() {
    return [...this.map.keys()]; // oldest -> newest
  }

  stats() {
    const total = this.hits + this.misses;
    return { policy: 'LRU', capacity: this.capacity, size: this.map.size, hits: this.hits, misses: this.misses, evictions: this.evictions, hitRate: total ? Math.round((this.hits / total) * 100) / 100 : 0 };
  }
}
