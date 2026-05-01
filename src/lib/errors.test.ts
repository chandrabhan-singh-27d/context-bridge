import { describe, expect, test } from 'bun:test';
import { AppError, formatAppError, isAppError } from './errors.ts';

describe('AppError constructors', () => {
  test('validation()', () => {
    const e = AppError.validation('repo', 'must be owner/name');
    expect(e).toEqual({
      type: 'VALIDATION_ERROR',
      field: 'repo',
      message: 'must be owner/name',
    });
  });

  test('validation() with issues', () => {
    const e = AppError.validation('q', 'bad', [{ path: ['q'], message: 'too short' }]);
    expect(e.issues).toEqual([{ path: ['q'], message: 'too short' }]);
  });

  test('auth()', () => {
    expect(AppError.auth('missing_token', 'GITHUB_TOKEN not set')).toEqual({
      type: 'AUTH_ERROR',
      reason: 'missing_token',
      message: 'GITHUB_TOKEN not set',
    });
  });

  test('githubApi() / rateLimit() / notFound() / internal()', () => {
    expect(AppError.githubApi(404, 'Not Found', '/repos/x/y').type).toBe('GITHUB_API_ERROR');
    expect(AppError.rateLimit(0, 0, 'exceeded').type).toBe('RATE_LIMIT_ERROR');
    expect(AppError.notFound('repo', 'no such repo').type).toBe('NOT_FOUND');
    expect(AppError.internal('boom').type).toBe('INTERNAL_ERROR');
    expect(AppError.internal('boom', new Error('x')).cause).toBeInstanceOf(Error);
  });
});

describe('isAppError', () => {
  test('accepts every variant', () => {
    expect(isAppError(AppError.validation('f', 'm'))).toBe(true);
    expect(isAppError(AppError.auth('invalid_token', 'm'))).toBe(true);
    expect(isAppError(AppError.githubApi(500, 'm', '/x'))).toBe(true);
  });

  test('rejects non-AppError values', () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError({})).toBe(false);
    expect(isAppError({ type: 'WHATEVER' })).toBe(false);
    expect(isAppError('string')).toBe(false);
  });
});

describe('formatAppError', () => {
  test('every variant produces a non-empty message', () => {
    const variants: ReadonlyArray<ReturnType<(typeof AppError)[keyof typeof AppError]>> = [
      AppError.validation('f', 'm'),
      AppError.auth('missing_token', 'm'),
      AppError.githubApi(500, 'm', '/x'),
      AppError.rateLimit(Date.now(), 10, 'soon'),
      AppError.notFound('repo', 'm'),
      AppError.internal('m'),
    ];
    for (const v of variants) {
      expect(formatAppError(v).length).toBeGreaterThan(0);
    }
  });

  test('never leaks raw cause objects', () => {
    const e = AppError.internal('oops', { secret: 'hunter2' });
    expect(formatAppError(e)).not.toContain('hunter2');
  });

  test('cause is non-enumerable so JSON.stringify drops it', () => {
    const e = AppError.internal('oops', { secret: 'hunter2' });
    expect(JSON.stringify(e)).not.toContain('hunter2');
    expect(JSON.stringify(e)).not.toContain('cause');
    expect(e.cause).toEqual({ secret: 'hunter2' });
  });
});
