/**
 * LRU + TTL cache. Generic primitive used by request-cache layers and
 * tool-result memoization. Persistent (bun:sqlite) cache lands in PR #9 and
 * uses this in front for hot reads.
 *
 * Implementation: factory + closure (no classes). Map preserves insertion
 * order in JS, so deletes + sets are O(1) and enough for the 100-1000 entry
 * sizes this project needs.
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

export interface LruCache<K, V> {
  readonly size: number;
  has(key: K): boolean;
  get(key: K): V | undefined;
  set(key: K, value: V, ttlMs?: number): void;
  delete(key: K): boolean;
  clear(): void;
}

export function createLruCache<K, V>(opts: LruCacheOptions): LruCache<K, V> {
  if (opts.maxEntries <= 0) {
    throw new Error('LruCache: maxEntries must be > 0');
  }
  const maxEntries = opts.maxEntries;
  const defaultTtlMs = opts.defaultTtlMs ?? Number.POSITIVE_INFINITY;
  const now = opts.clock ?? Date.now;
  const map = new Map<K, Entry<V>>();

  const isExpired = (entry: Entry<V>): boolean =>
    entry.expiresAt !== Number.POSITIVE_INFINITY && entry.expiresAt <= now();

  return {
    get size() {
      return map.size;
    },

    has(key) {
      const entry = map.get(key);
      if (entry === undefined) return false;
      if (isExpired(entry)) {
        map.delete(key);
        return false;
      }
      return true;
    },

    get(key) {
      const entry = map.get(key);
      if (entry === undefined) return undefined;
      if (isExpired(entry)) {
        map.delete(key);
        return undefined;
      }
      // refresh recency
      map.delete(key);
      map.set(key, entry);
      return entry.value;
    },

    set(key, value, ttlMs = defaultTtlMs) {
      const expiresAt =
        ttlMs === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : now() + ttlMs;
      if (map.has(key)) map.delete(key);
      map.set(key, { value, expiresAt });
      while (map.size > maxEntries) {
        const oldest = map.keys().next();
        if (oldest.done === true) break;
        map.delete(oldest.value);
      }
    },

    delete(key) {
      return map.delete(key);
    },

    clear() {
      map.clear();
    },
  };
}
