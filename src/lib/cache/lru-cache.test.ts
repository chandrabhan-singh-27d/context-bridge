import { describe, expect, test } from 'bun:test';
import { createLruCache } from './lru-cache.ts';

describe('createLruCache', () => {
  test('rejects invalid sizes', () => {
    expect(() => createLruCache({ maxEntries: 0 })).toThrow();
    expect(() => createLruCache({ maxEntries: -1 })).toThrow();
  });

  test('basic set/get/has/delete', () => {
    const c = createLruCache<string, number>({ maxEntries: 3 });
    c.set('a', 1);
    expect(c.has('a')).toBe(true);
    expect(c.get('a')).toBe(1);
    expect(c.size).toBe(1);
    expect(c.delete('a')).toBe(true);
    expect(c.has('a')).toBe(false);
  });

  test('evicts least recently used when at capacity', () => {
    const c = createLruCache<string, number>({ maxEntries: 2 });
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // bump a
    c.set('c', 3); // should evict b
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
    expect(c.has('c')).toBe(true);
  });

  test('expires entries past TTL', () => {
    let now = 0;
    const c = createLruCache<string, number>({
      maxEntries: 10,
      defaultTtlMs: 100,
      clock: () => now,
    });
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    now = 101;
    expect(c.get('a')).toBeUndefined();
    expect(c.has('a')).toBe(false);
  });

  test('per-call TTL overrides default', () => {
    let now = 0;
    const c = createLruCache<string, number>({
      maxEntries: 10,
      defaultTtlMs: 100,
      clock: () => now,
    });
    c.set('a', 1, 1000);
    now = 500;
    expect(c.get('a')).toBe(1);
    now = 1001;
    expect(c.get('a')).toBeUndefined();
  });

  test('clear empties the cache', () => {
    const c = createLruCache<string, number>({ maxEntries: 3 });
    c.set('a', 1);
    c.set('b', 2);
    c.clear();
    expect(c.size).toBe(0);
  });

  test('updating an existing key keeps it most-recent', () => {
    const c = createLruCache<string, number>({ maxEntries: 2 });
    c.set('a', 1);
    c.set('b', 2);
    c.set('a', 10); // a is now newest
    c.set('c', 3); // evicts b
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
    expect(c.has('c')).toBe(true);
    expect(c.get('a')).toBe(10);
  });
});
