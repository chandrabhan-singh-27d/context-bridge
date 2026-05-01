import { describe, expect, test } from 'bun:test';
import { createLruCache } from './lru-cache.ts';
import { createSqliteCache } from './sqlite-cache.ts';
import { createTieredCache } from './tiered-cache.ts';

function build(opts?: { clock?: () => number }) {
  const lruOpts: { maxEntries: number; clock?: () => number } = { maxEntries: 8 };
  if (opts?.clock !== undefined) lruOpts.clock = opts.clock;
  const lru = createLruCache<string, string>(lruOpts);
  const sqliteR = createSqliteCache(opts);
  if (!sqliteR.ok) throw new Error('failed to build sqlite cache');
  const sqlite = sqliteR.value;
  const tiered = createTieredCache({ lru, sqlite });
  return { lru, sqlite, tiered };
}

describe('createTieredCache', () => {
  test('writes go to both tiers', () => {
    const { lru, sqlite, tiered } = build();
    tiered.set('a', 'v');
    expect(lru.get('a')).toBe('v');
    expect(sqlite.get('a')).toBe('v');
    sqlite.close();
  });

  test('LRU hit short-circuits SQLite', () => {
    const { lru, sqlite, tiered } = build();
    lru.set('a', 'lru-value');
    sqlite.set('a', 'sqlite-value');
    expect(tiered.get('a')).toBe('lru-value');
    sqlite.close();
  });

  test('SQLite hit promotes to LRU', () => {
    const { lru, sqlite, tiered } = build();
    sqlite.set('a', 'cold');
    expect(lru.get('a')).toBeUndefined();
    expect(tiered.get('a')).toBe('cold');
    expect(lru.get('a')).toBe('cold');
    sqlite.close();
  });

  test('full miss returns undefined', () => {
    const { tiered, sqlite } = build();
    expect(tiered.get('missing')).toBeUndefined();
    sqlite.close();
  });

  test('delete clears both tiers', () => {
    const { lru, sqlite, tiered } = build();
    tiered.set('a', 'v');
    tiered.delete('a');
    expect(lru.get('a')).toBeUndefined();
    expect(sqlite.get('a')).toBeUndefined();
    sqlite.close();
  });

  test('delete returns true when at least one tier had the key', () => {
    const { sqlite, tiered } = build();
    sqlite.set('only-cold', 'v');
    expect(tiered.delete('only-cold')).toBe(true);
    expect(tiered.delete('never-existed')).toBe(false);
    sqlite.close();
  });

  test('clear wipes both tiers', () => {
    const { lru, sqlite, tiered } = build();
    tiered.set('a', '1');
    tiered.set('b', '2');
    tiered.clear();
    expect(lru.get('a')).toBeUndefined();
    expect(sqlite.get('b')).toBeUndefined();
    sqlite.close();
  });

  test('LRU promotion respects SQLite remaining TTL', () => {
    let t = 1000;
    const { lru, sqlite, tiered } = build({ clock: () => t });
    sqlite.set('a', 'cold', 500);
    t = 1100;
    expect(tiered.get('a')).toBe('cold');
    // SQLite expired (t=1600 > 1500); LRU must also have expired since promotion
    // copied the remaining 400ms TTL.
    t = 1600;
    expect(lru.get('a')).toBeUndefined();
    sqlite.close();
  });
});
