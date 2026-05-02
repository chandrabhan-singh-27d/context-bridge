import { describe, expect, test } from 'bun:test';
import { createTokenBucket } from './token-bucket.ts';

describe('token bucket', () => {
  test('allows up to capacity then denies', () => {
    const t = 0;
    const b = createTokenBucket({ capacity: 3, refillPerSec: 1, now: () => t });
    expect(b.take('a')).toBe(true);
    expect(b.take('a')).toBe(true);
    expect(b.take('a')).toBe(true);
    expect(b.take('a')).toBe(false);
  });

  test('refills over time', () => {
    let t = 0;
    const b = createTokenBucket({ capacity: 2, refillPerSec: 2, now: () => t });
    expect(b.take('a')).toBe(true);
    expect(b.take('a')).toBe(true);
    expect(b.take('a')).toBe(false);
    t = 1000;
    expect(b.take('a')).toBe(true);
    expect(b.take('a')).toBe(true);
    expect(b.take('a')).toBe(false);
  });

  test('caps refill at capacity', () => {
    let t = 0;
    const b = createTokenBucket({ capacity: 2, refillPerSec: 5, now: () => t });
    t = 60_000;
    expect(b.peek('a')).toBe(2);
  });

  test('per-key isolation', () => {
    const t = 0;
    const b = createTokenBucket({ capacity: 1, refillPerSec: 1, now: () => t });
    expect(b.take('a')).toBe(true);
    expect(b.take('b')).toBe(true);
    expect(b.take('a')).toBe(false);
    expect(b.take('b')).toBe(false);
  });

  test('rejects bad config', () => {
    expect(() => createTokenBucket({ capacity: 0, refillPerSec: 1 })).toThrow();
    expect(() => createTokenBucket({ capacity: 1, refillPerSec: 0 })).toThrow();
  });
});
