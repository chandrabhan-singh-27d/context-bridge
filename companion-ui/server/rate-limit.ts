import type { MiddlewareHandler } from 'hono';
import type { TokenBucket } from './token-bucket.ts';

export type RateLimitOptions = {
  readonly bucket: TokenBucket;
  readonly keyFor?: (c: Parameters<MiddlewareHandler>[0]) => string;
};

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const keyFor =
    opts.keyFor ??
    ((c) => {
      const fwd = c.req.header('x-forwarded-for');
      if (fwd !== undefined) {
        const first = fwd.split(',')[0]?.trim();
        if (first !== undefined && first !== '') return first;
      }
      return c.req.header('x-real-ip') ?? 'unknown';
    });

  return async (c, next) => {
    const key = keyFor(c);
    if (!opts.bucket.take(key)) {
      return c.json({ error: 'rate_limited', remaining: 0 }, 429);
    }
    return next();
  };
}
