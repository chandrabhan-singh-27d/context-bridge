import { describe, expect, test } from 'bun:test';
import { buildCacheKey } from './cache-key.ts';

describe('buildCacheKey', () => {
  test('empty params produces stable suffix', () => {
    expect(buildCacheKey({ endpoint: 'GET /a', owner: 'x', repo: 'y' })).toBe('GET /a|x/y|');
  });

  test('drops undefined params', () => {
    expect(
      buildCacheKey({
        endpoint: 'GET /a',
        owner: 'x',
        repo: 'y',
        params: { ref: undefined, limit: 10 },
      }),
    ).toBe('GET /a|x/y|limit=10');
  });

  test('orders params by key for stability', () => {
    const a = buildCacheKey({
      endpoint: 'E',
      owner: 'x',
      repo: 'y',
      params: { b: 2, a: 1 },
    });
    const b = buildCacheKey({
      endpoint: 'E',
      owner: 'x',
      repo: 'y',
      params: { a: 1, b: 2 },
    });
    expect(a).toBe(b);
  });

  test('different param values yield different keys', () => {
    const a = buildCacheKey({ endpoint: 'E', owner: 'x', repo: 'y', params: { q: 'foo' } });
    const b = buildCacheKey({ endpoint: 'E', owner: 'x', repo: 'y', params: { q: 'bar' } });
    expect(a).not.toBe(b);
  });

  test('JSON-stringifies values so booleans and numbers serialize uniformly', () => {
    expect(
      buildCacheKey({
        endpoint: 'E',
        owner: 'x',
        repo: 'y',
        params: { open: true, limit: 5, query: 'hi' },
      }),
    ).toBe('E|x/y|limit=5&open=true&query="hi"');
  });
});
