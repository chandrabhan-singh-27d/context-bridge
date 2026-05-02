/**
 * Generic cache wrapper for handler functions. Looks up a cache key, returns
 * the cached `Result.ok` if present; on miss runs the handler and stores
 * `ok` results back into the cache. Errors are never cached — they retry
 * on the next call.
 *
 * Stores stringified JSON. Poisoned entries (parse failure) are evicted and
 * the handler is invoked.
 */

import type { TieredCache } from '../lib/cache/tiered-cache.ts';
import type { AppError } from '../lib/errors.ts';
import { ok, type Result } from '../lib/result.ts';

export async function withCache<T>(
  cache: TieredCache,
  key: string,
  ttlMs: number,
  fn: () => Promise<Result<T, AppError>>,
): Promise<Result<T, AppError>> {
  const hit = cache.get(key);
  if (hit !== undefined) {
    try {
      return ok(JSON.parse(hit) as T);
    } catch {
      cache.delete(key);
    }
  }
  const r = await fn();
  if (r.ok) cache.set(key, JSON.stringify(r.value), ttlMs);
  return r;
}
