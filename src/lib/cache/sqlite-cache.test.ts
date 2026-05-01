import { describe, expect, test } from 'bun:test';
import { createSqliteCache } from './sqlite-cache.ts';

describe('createSqliteCache', () => {
  test('round-trips a value', () => {
    const c = createSqliteCache();
    c.set('a', 'hello');
    expect(c.get('a')).toBe('hello');
    c.close();
  });

  test('upserts on duplicate key', () => {
    const c = createSqliteCache();
    c.set('a', 'first');
    c.set('a', 'second');
    expect(c.get('a')).toBe('second');
    c.close();
  });

  test('expires entries past ttl using injected clock', () => {
    let t = 1000;
    const c = createSqliteCache({ clock: () => t });
    c.set('a', 'v', 100);
    expect(c.get('a')).toBe('v');
    t = 1101;
    expect(c.get('a')).toBeUndefined();
    c.close();
  });

  test('never expires when no ttl set and no default', () => {
    let t = 0;
    const c = createSqliteCache({ clock: () => t });
    c.set('a', 'v');
    t = 10 ** 12;
    expect(c.get('a')).toBe('v');
    c.close();
  });

  test('delete removes a row', () => {
    const c = createSqliteCache();
    c.set('a', 'v');
    expect(c.delete('a')).toBe(true);
    expect(c.get('a')).toBeUndefined();
    expect(c.delete('a')).toBe(false);
    c.close();
  });

  test('purgeExpired drops only expired rows', () => {
    let t = 1000;
    const c = createSqliteCache({ clock: () => t });
    c.set('alive', 'v', 10_000);
    c.set('dead', 'v', 100);
    t = 1200;
    const removed = c.purgeExpired();
    expect(removed).toBe(1);
    expect(c.get('alive')).toBe('v');
    expect(c.get('dead')).toBeUndefined();
    c.close();
  });

  test('clear empties the table', () => {
    const c = createSqliteCache();
    c.set('a', '1');
    c.set('b', '2');
    c.clear();
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBeUndefined();
    c.close();
  });

  test('defaultTtlMs applies when ttlMs omitted', () => {
    let t = 0;
    const c = createSqliteCache({ defaultTtlMs: 50, clock: () => t });
    c.set('a', 'v');
    t = 51;
    expect(c.get('a')).toBeUndefined();
    c.close();
  });
});
