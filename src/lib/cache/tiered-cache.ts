/**
 * TieredCache — LRU front, SQLite back. Read order: LRU → SQLite → miss.
 * On SQLite hit, value is promoted into the LRU. Writes hit both tiers
 * with the same TTL.
 *
 * Both tiers store strings; this primitive stays serializer-agnostic so a
 * caller can pick JSON, msgpack, or anything else. Tool-level caches will
 * wrap this with a typed shim.
 */

import type { LruCache } from './lru-cache.ts';
import type { SqliteCache } from './sqlite-cache.ts';

export interface TieredCache {
  get(key: string): string | undefined;
  set(key: string, value: string, ttlMs?: number): void;
  delete(key: string): boolean;
  clear(): void;
}

export interface TieredCacheDeps {
  readonly lru: LruCache<string, string>;
  readonly sqlite: SqliteCache;
}

export function createTieredCache(deps: TieredCacheDeps): TieredCache {
  const { lru, sqlite } = deps;
  return {
    get(key) {
      const hot = lru.get(key);
      if (hot !== undefined) return hot;
      const cold = sqlite.get(key);
      if (cold === undefined) return undefined;
      const remaining = sqlite.getRemainingTtl(key);
      if (remaining === undefined) return cold;
      if (remaining === Number.POSITIVE_INFINITY) lru.set(key, cold);
      else lru.set(key, cold, remaining);
      return cold;
    },

    set(key, value, ttlMs) {
      lru.set(key, value, ttlMs);
      sqlite.set(key, value, ttlMs);
    },

    delete(key) {
      const lruDeleted = lru.delete(key);
      const sqliteDeleted = sqlite.delete(key);
      return lruDeleted || sqliteDeleted;
    },

    clear() {
      lru.clear();
      sqlite.clear();
    },
  };
}
