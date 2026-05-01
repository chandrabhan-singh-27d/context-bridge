/**
 * Cache factory. Wires LRU front + bun:sqlite back into a TieredCache. The
 * sqlite path is configurable; in-memory is fine for development and tests.
 *
 * Returns Result so that an unwritable cache path surfaces as an AppError
 * at startup rather than crashing later under load.
 */

import { createLruCache } from '../lib/cache/lru-cache.ts';
import { createSqliteCache } from '../lib/cache/sqlite-cache.ts';
import { type TieredCache, createTieredCache } from '../lib/cache/tiered-cache.ts';
import type { AppError } from '../lib/errors.ts';
import { type Result, ok } from '../lib/result.ts';

export interface BuildCacheOptions {
  readonly path?: string;
  readonly lruMaxEntries?: number;
  readonly defaultTtlMs?: number;
}

export function buildCache(opts: BuildCacheOptions = {}): Result<TieredCache, AppError> {
  const lru = createLruCache<string, string>({
    maxEntries: opts.lruMaxEntries ?? 1024,
    ...(opts.defaultTtlMs !== undefined ? { defaultTtlMs: opts.defaultTtlMs } : {}),
  });
  const sqliteR = createSqliteCache({
    ...(opts.path !== undefined ? { path: opts.path } : {}),
    ...(opts.defaultTtlMs !== undefined ? { defaultTtlMs: opts.defaultTtlMs } : {}),
  });
  if (!sqliteR.ok) return sqliteR;
  return ok(createTieredCache({ lru, sqlite: sqliteR.value }));
}
