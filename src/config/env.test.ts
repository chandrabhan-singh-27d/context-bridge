import { describe, expect, test } from 'bun:test';
import { loadEnv } from './env.ts';

describe('loadEnv', () => {
  test('valid env returns Ok with parsed shape', () => {
    const r = loadEnv({
      GITHUB_TOKEN: 'ghp_test',
      DEFAULT_REPO: 'owner/repo',
      CACHE_TTL_SECONDS: '600',
      LOG_LEVEL: 'debug',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.GITHUB_TOKEN).toBe('ghp_test');
      expect(r.value.DEFAULT_REPO).toBe('owner/repo');
      expect(r.value.CACHE_TTL_SECONDS).toBe(600);
      expect(r.value.LOG_LEVEL).toBe('debug');
    }
  });

  test('missing GITHUB_TOKEN returns Err', () => {
    const r = loadEnv({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.type).toBe('VALIDATION_ERROR');
      expect(r.error.message).toContain('GITHUB_TOKEN');
    }
  });

  test('CACHE_TTL_SECONDS coerced from string', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't', CACHE_TTL_SECONDS: '120' });
    if (r.ok) expect(r.value.CACHE_TTL_SECONDS).toBe(120);
  });

  test('CACHE_TTL_SECONDS defaults to 300', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't' });
    if (r.ok) expect(r.value.CACHE_TTL_SECONDS).toBe(300);
  });

  test('LOG_LEVEL defaults to info', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't' });
    if (r.ok) expect(r.value.LOG_LEVEL).toBe('info');
  });

  test('LOG_LEVEL rejects bogus values', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't', LOG_LEVEL: 'verbose' });
    expect(r.ok).toBe(false);
  });

  test('DEFAULT_REPO must be owner/repo shape', () => {
    const ok = loadEnv({ GITHUB_TOKEN: 't', DEFAULT_REPO: 'org/proj' });
    expect(ok.ok).toBe(true);
    const bad = loadEnv({ GITHUB_TOKEN: 't', DEFAULT_REPO: 'no-slash' });
    expect(bad.ok).toBe(false);
  });
});
