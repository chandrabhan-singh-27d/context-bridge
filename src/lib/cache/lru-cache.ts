/**
 * LRU + TTL cache. Generic primitive used by request-cache layers and
 * tool-result memoization. Persistent (bun:sqlite) cache lands in PR #9 and
 * uses this in front for hot reads.
 *
 * Implementation: Map preserves insertion order in JS, so deletes + sets
 * are O(1) and enough for the 100-1000 entry sizes this project needs.
 */

export interface LruCacheOptions {
  readonly maxEntries: number;
  readonly defaultTtlMs?: number;
  readonly clock?: () => number;
}

interface Entry<V> {
  readonly value: V;
  readonly expiresAt: number;
}

export class LruCache<K, V> {
  private readonly map = new Map<K, Entry<V>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private readonly now: () => number;

  constructor(opts: LruCacheOptions) {
    if (opts.maxEntries <= 0) {
      throw new Error('LruCache: maxEntries must be > 0');
    }
    this.maxEntries = opts.maxEntries;
    this.defaultTtlMs = opts.defaultTtlMs ?? Number.POSITIVE_INFINITY;
    this.now = opts.clock ?? Date.now;
  }

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    const entry = this.map.get(key);
    if (entry === undefined) return false;
    if (this.expired(entry)) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    if (this.expired(entry)) {
      this.map.delete(key);
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs: number = this.defaultTtlMs): void {
    const expiresAt =
      ttlMs === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : this.now() + ttlMs;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done === true) break;
      this.map.delete(oldest.value);
    }
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  private expired(entry: Entry<V>): boolean {
    return entry.expiresAt !== Number.POSITIVE_INFINITY && entry.expiresAt <= this.now();
  }
}
