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

  test('WRITES_ENABLED defaults to false', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't' });
    if (r.ok) expect(r.value.WRITES_ENABLED).toBe(false);
  });

  test('WRITES_ENABLED accepts "true" string', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't', WRITES_ENABLED: 'true' });
    if (r.ok) expect(r.value.WRITES_ENABLED).toBe(true);
  });

  test('WRITES_ENABLED any non-true string is false', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't', WRITES_ENABLED: '1' });
    if (r.ok) expect(r.value.WRITES_ENABLED).toBe(false);
  });

  test('LLM_PROVIDER defaults to groq', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't' });
    if (r.ok) expect(r.value.LLM_PROVIDER).toBe('groq');
  });

  test('LLM_PROVIDER accepts groq | openai | anthropic', () => {
    for (const provider of ['groq', 'openai', 'anthropic']) {
      const r = loadEnv({ GITHUB_TOKEN: 't', LLM_PROVIDER: provider });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.LLM_PROVIDER).toBe(provider as 'groq' | 'openai' | 'anthropic');
    }
  });

  test('LLM_PROVIDER rejects unknown provider', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't', LLM_PROVIDER: 'cohere' });
    expect(r.ok).toBe(false);
  });

  test('LLM_API_KEY and LLM_MODEL are optional', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't' });
    if (r.ok) {
      expect(r.value.LLM_API_KEY).toBeUndefined();
      expect(r.value.LLM_MODEL).toBeUndefined();
    }
  });

  test('EMBEDDING_PROVIDER defaults to openai', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't' });
    if (r.ok) expect(r.value.EMBEDDING_PROVIDER).toBe('openai');
  });

  test('EMBEDDING_PROVIDER accepts openai | voyage', () => {
    for (const provider of ['openai', 'voyage']) {
      const r = loadEnv({ GITHUB_TOKEN: 't', EMBEDDING_PROVIDER: provider });
      expect(r.ok).toBe(true);
    }
  });

  test('EMBEDDING_PROVIDER rejects unknown provider', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't', EMBEDDING_PROVIDER: 'cohere' });
    expect(r.ok).toBe(false);
  });

  test('EMBEDDING_API_KEY and EMBEDDING_MODEL optional', () => {
    const r = loadEnv({ GITHUB_TOKEN: 't' });
    if (r.ok) {
      expect(r.value.EMBEDDING_API_KEY).toBeUndefined();
      expect(r.value.EMBEDDING_MODEL).toBeUndefined();
    }
  });
});
