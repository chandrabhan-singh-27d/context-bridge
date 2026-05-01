import { describe, expect, test } from 'bun:test';
import { createLruCache } from './lru-cache.ts';
import { createSqliteCache } from './sqlite-cache.ts';
import { createTieredCache } from './tiered-cache.ts';

function build() {
  const lru = createLruCache<string, string>({ maxEntries: 8 });
  const sqlite = createSqliteCache();
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
});
