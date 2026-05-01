/**
 * GitHub rate-limit awareness. Parses `X-RateLimit-*` response headers and
 * classifies the current budget into ok / soft (low) / hard (critical).
 *
 * Soft threshold logs a warning so operators can scale back. Hard threshold
 * logs an error — callers about to fan out should pause. Actual throttling
 * happens via standard 403 + remaining=0 mapped through `mapGitHubError` in
 * `src/github/errors.ts`; this module only adds proactive observability.
 */

import type { Logger } from '../lib/logging/logger.ts';

export const SOFT_THRESHOLD_RATIO = 0.2; // warn under 20% remaining
export const HARD_THRESHOLD_RATIO = 0.05; // error under 5% remaining

export type RateLimitLevel = 'ok' | 'soft' | 'hard';

export interface RateLimitState {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number; // unix ms
  readonly resource: string | null;
  readonly level: RateLimitLevel;
}

type Headerish = Record<string, string | string[] | undefined> | undefined;

function headerNum(headers: Headerish, key: string): number | null {
  if (headers === undefined) return null;
  const raw = headers[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function headerStr(headers: Headerish, key: string): string | null {
  if (headers === undefined) return null;
  const raw = headers[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ?? null;
}

export function classifyRateLimit(remaining: number, limit: number): RateLimitLevel {
  if (limit <= 0) return 'ok';
  const ratio = remaining / limit;
  if (ratio <= HARD_THRESHOLD_RATIO) return 'hard';
  if (ratio <= SOFT_THRESHOLD_RATIO) return 'soft';
  return 'ok';
}

export function parseRateLimit(headers: Headerish): RateLimitState | null {
  const limit = headerNum(headers, 'x-ratelimit-limit');
  const remaining = headerNum(headers, 'x-ratelimit-remaining');
  const reset = headerNum(headers, 'x-ratelimit-reset');
  if (limit === null || remaining === null || reset === null) return null;
  return {
    limit,
    remaining,
    resetAt: reset * 1000,
    resource: headerStr(headers, 'x-ratelimit-resource'),
    level: classifyRateLimit(remaining, limit),
  };
}

export function logRateLimit(log: Logger, state: RateLimitState): void {
  if (state.level === 'ok') return;
  const fields = {
    limit: state.limit,
    remaining: state.remaining,
    resetAt: new Date(state.resetAt).toISOString(),
    resource: state.resource,
  };
  if (state.level === 'hard') log.error('github rate limit critical', fields);
  else log.warn('github rate limit low', fields);
}
