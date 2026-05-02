/**
 * In-memory token bucket. One bucket per key (typically per IP).
 * Refills at `refillPerSec` up to `capacity`. `take()` returns false when empty.
 *
 * Not horizontally distributed — fine for the companion UI (single-process demo).
 */

export type TokenBucketOptions = {
  readonly capacity: number;
  readonly refillPerSec: number;
  readonly now?: () => number;
  readonly idleEvictMs?: number;
};

type Bucket = {
  tokens: number;
  lastRefill: number;
};

export type TokenBucket = {
  take(key: string, cost?: number): boolean;
  peek(key: string): number;
  size(): number;
};

export function createTokenBucket(opts: TokenBucketOptions): TokenBucket {
  if (opts.capacity <= 0) throw new Error('capacity must be > 0');
  if (opts.refillPerSec <= 0) throw new Error('refillPerSec must be > 0');

  const now = opts.now ?? (() => Date.now());
  const idleEvictMs = opts.idleEvictMs ?? 5 * 60_000;
  const buckets = new Map<string, Bucket>();

  function refill(b: Bucket, t: number): void {
    const elapsedSec = (t - b.lastRefill) / 1000;
    if (elapsedSec <= 0) return;
    b.tokens = Math.min(opts.capacity, b.tokens + elapsedSec * opts.refillPerSec);
    b.lastRefill = t;
  }

  function evictIdle(t: number): void {
    for (const [k, b] of buckets) {
      if (t - b.lastRefill > idleEvictMs) buckets.delete(k);
    }
  }

  return {
    take(key, cost = 1): boolean {
      if (cost <= 0) return true;
      const t = now();
      let b = buckets.get(key);
      if (b === undefined) {
        b = { tokens: opts.capacity, lastRefill: t };
        buckets.set(key, b);
        if (buckets.size % 64 === 0) evictIdle(t);
      } else {
        refill(b, t);
      }
      if (b.tokens >= cost) {
        b.tokens -= cost;
        return true;
      }
      return false;
    },
    peek(key): number {
      const b = buckets.get(key);
      if (b === undefined) return opts.capacity;
      const t = now();
      refill(b, t);
      return b.tokens;
    },
    size(): number {
      return buckets.size;
    },
  };
}
