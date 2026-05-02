import { describe, expect, test } from 'bun:test';
import { createLruCache } from '../lib/cache/lru-cache.ts';
import { createSqliteCache } from '../lib/cache/sqlite-cache.ts';
import { createTieredCache } from '../lib/cache/tiered-cache.ts';
import { AppError } from '../lib/errors.ts';
import { err, ok, type Result } from '../lib/result.ts';
import { withCache } from './with-cache.ts';

function build() {
  const lru = createLruCache<string, string>({ maxEntries: 16 });
  const sqliteR = createSqliteCache();
  if (!sqliteR.ok) throw new Error('sqlite init failed');
  const cache = createTieredCache({ lru, sqlite: sqliteR.value });
  return { cache, sqlite: sqliteR.value };
}

describe('withCache', () => {
  test('miss → calls fn, stores result, returns ok', async () => {
    const { cache, sqlite } = build();
    let calls = 0;
    const fn = async (): Promise<Result<{ n: number }, AppError>> => {
      calls += 1;
      return ok({ n: 42 });
    };
    const r1 = await withCache(cache, 'k', 60_000, fn);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value.n).toBe(42);
    expect(calls).toBe(1);

    const r2 = await withCache(cache, 'k', 60_000, fn);
    expect(r2.ok).toBe(true);
    expect(calls).toBe(1); // cached
    sqlite.close();
  });

  test('does not cache errors', async () => {
    const { cache, sqlite } = build();
    let calls = 0;
    const fn = async (): Promise<Result<{ n: number }, AppError>> => {
      calls += 1;
      return err(AppError.notFound('x', 'missing'));
    };
    await withCache(cache, 'k', 60_000, fn);
    await withCache(cache, 'k', 60_000, fn);
    expect(calls).toBe(2);
    sqlite.close();
  });

  test('poisoned entry triggers refetch', async () => {
    const { cache, sqlite } = build();
    cache.set('k', 'not json{{');
    let calls = 0;
    const fn = async (): Promise<Result<{ n: number }, AppError>> => {
      calls += 1;
      return ok({ n: 7 });
    };
    const r = await withCache(cache, 'k', 60_000, fn);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.n).toBe(7);
    expect(calls).toBe(1);
    sqlite.close();
  });
});
