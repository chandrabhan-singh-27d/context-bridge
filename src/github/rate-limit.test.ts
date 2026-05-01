import { describe, expect, test } from 'bun:test';
import type { Logger } from '../lib/logging/logger.ts';
import { classifyRateLimit, logRateLimit, parseRateLimit } from './rate-limit.ts';

describe('classifyRateLimit', () => {
  test('ok above 20%', () => {
    expect(classifyRateLimit(800, 1000)).toBe('ok');
  });
  test('soft at or below 20%', () => {
    expect(classifyRateLimit(200, 1000)).toBe('soft');
    expect(classifyRateLimit(100, 1000)).toBe('soft');
  });
  test('hard at or below 5%', () => {
    expect(classifyRateLimit(50, 1000)).toBe('hard');
    expect(classifyRateLimit(0, 1000)).toBe('hard');
  });
  test('limit <= 0 returns ok defensively', () => {
    expect(classifyRateLimit(0, 0)).toBe('ok');
  });
});

describe('parseRateLimit', () => {
  test('returns null when headers missing', () => {
    expect(parseRateLimit(undefined)).toBeNull();
    expect(parseRateLimit({})).toBeNull();
  });

  test('returns null when any required header absent', () => {
    expect(
      parseRateLimit({
        'x-ratelimit-limit': '1000',
        'x-ratelimit-remaining': '500',
      }),
    ).toBeNull();
  });

  test('parses numeric values + reset epoch ms + level', () => {
    const r = parseRateLimit({
      'x-ratelimit-limit': '1000',
      'x-ratelimit-remaining': '50',
      'x-ratelimit-reset': '1700000000',
      'x-ratelimit-resource': 'core',
    });
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.limit).toBe(1000);
    expect(r.remaining).toBe(50);
    expect(r.resetAt).toBe(1_700_000_000_000);
    expect(r.resource).toBe('core');
    expect(r.level).toBe('hard');
  });

  test('handles array-valued headers (Node http API quirk)', () => {
    const r = parseRateLimit({
      'x-ratelimit-limit': ['1000'],
      'x-ratelimit-remaining': ['900'],
      'x-ratelimit-reset': ['1700000000'],
    });
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.remaining).toBe(900);
    expect(r.level).toBe('ok');
  });

  test('non-numeric values yield null', () => {
    const r = parseRateLimit({
      'x-ratelimit-limit': 'abc',
      'x-ratelimit-remaining': '500',
      'x-ratelimit-reset': '1700000000',
    });
    expect(r).toBeNull();
  });
});

describe('logRateLimit', () => {
  function spyLogger() {
    const calls: Array<{ level: string; msg: string; fields?: Record<string, unknown> }> = [];
    const log: Logger = {
      level: 'debug',
      debug: (msg, fields) => calls.push({ level: 'debug', msg, ...(fields && { fields }) }),
      info: (msg, fields) => calls.push({ level: 'info', msg, ...(fields && { fields }) }),
      warn: (msg, fields) => calls.push({ level: 'warn', msg, ...(fields && { fields }) }),
      error: (msg, fields) => calls.push({ level: 'error', msg, ...(fields && { fields }) }),
      child: () => log,
    };
    return { log, calls };
  }

  test('skips ok level (no log)', () => {
    const { log, calls } = spyLogger();
    logRateLimit(log, {
      limit: 1000,
      remaining: 800,
      resetAt: 0,
      resource: 'core',
      level: 'ok',
    });
    expect(calls.length).toBe(0);
  });

  test('warns on soft level', () => {
    const { log, calls } = spyLogger();
    logRateLimit(log, {
      limit: 1000,
      remaining: 100,
      resetAt: 0,
      resource: 'core',
      level: 'soft',
    });
    expect(calls.length).toBe(1);
    expect(calls[0]?.level).toBe('warn');
  });

  test('errors on hard level', () => {
    const { log, calls } = spyLogger();
    logRateLimit(log, {
      limit: 1000,
      remaining: 5,
      resetAt: 0,
      resource: 'core',
      level: 'hard',
    });
    expect(calls.length).toBe(1);
    expect(calls[0]?.level).toBe('error');
  });
});
