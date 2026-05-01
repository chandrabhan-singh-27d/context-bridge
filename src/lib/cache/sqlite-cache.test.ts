import { describe, expect, test } from 'bun:test';
import { createSqliteCache } from './sqlite-cache.ts';

function buildCache(opts?: Parameters<typeof createSqliteCache>[0]) {
  const r = createSqliteCache(opts);
  if (!r.ok) throw new Error(`failed to create cache: ${r.error.message}`);
  return r.value;
}

describe('createSqliteCache', () => {
  test('returns Result.ok on success', () => {
    const r = createSqliteCache();
    expect(r.ok).toBe(true);
    if (r.ok) r.value.close();
  });

  test('returns Result.err on bad path', () => {
    const r = createSqliteCache({ path: '/nonexistent-dir-xyz/cache.sqlite' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('INTERNAL_ERROR');
  });

  test('round-trips a value', () => {
    const c = buildCache();
    c.set('a', 'hello');
    expect(c.get('a')).toBe('hello');
    c.close();
  });

  test('upserts on duplicate key', () => {
    const c = buildCache();
    c.set('a', 'first');
    c.set('a', 'second');
    expect(c.get('a')).toBe('second');
    c.close();
  });

  test('expires entries past ttl using injected clock', () => {
    let t = 1000;
    const c = buildCache({ clock: () => t });
    c.set('a', 'v', 100);
    expect(c.get('a')).toBe('v');
    t = 1101;
    expect(c.get('a')).toBeUndefined();
    c.close();
  });

  test('never expires when no ttl set and no default', () => {
    let t = 0;
    const c = buildCache({ clock: () => t });
    c.set('a', 'v');
    t = 10 ** 12;
    expect(c.get('a')).toBe('v');
    c.close();
  });

  test('delete removes a row', () => {
    const c = buildCache();
    c.set('a', 'v');
    expect(c.delete('a')).toBe(true);
    expect(c.get('a')).toBeUndefined();
    expect(c.delete('a')).toBe(false);
    c.close();
  });

  test('purgeExpired drops only expired rows', () => {
    let t = 1000;
    const c = buildCache({ clock: () => t });
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
    const c = buildCache();
    c.set('a', '1');
    c.set('b', '2');
    c.clear();
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBeUndefined();
    c.close();
  });

  test('defaultTtlMs applies when ttlMs omitted', () => {
    let t = 0;
    const c = buildCache({ defaultTtlMs: 50, clock: () => t });
    c.set('a', 'v');
    t = 51;
    expect(c.get('a')).toBeUndefined();
    c.close();
  });

  test('getRemainingTtl returns remaining ms for ttl entries', () => {
    let t = 1000;
    const c = buildCache({ clock: () => t });
    c.set('a', 'v', 500);
    t = 1100;
    expect(c.getRemainingTtl('a')).toBe(400);
    c.close();
  });

  test('getRemainingTtl returns Infinity for never-expiring entries', () => {
    const c = buildCache();
    c.set('a', 'v');
    expect(c.getRemainingTtl('a')).toBe(Number.POSITIVE_INFINITY);
    c.close();
  });

  test('getRemainingTtl returns undefined for missing or expired entries', () => {
    let t = 1000;
    const c = buildCache({ clock: () => t });
    expect(c.getRemainingTtl('missing')).toBeUndefined();
    c.set('a', 'v', 100);
    t = 1200;
    expect(c.getRemainingTtl('a')).toBeUndefined();
    c.close();
  });
});
