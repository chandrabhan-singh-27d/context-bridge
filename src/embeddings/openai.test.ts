import { describe, expect, test } from 'bun:test';
import { createOpenAiEmbeddingProvider } from './openai.ts';

function fakeFetch(response: {
  status: number;
  body: unknown;
  capture?: (url: string, init: RequestInit) => void;
}): typeof fetch {
  return (async (url: string | URL | Request, init: RequestInit = {}) => {
    response.capture?.(String(url), init);
    return new Response(
      typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
      { status: response.status, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
}

describe('createOpenAiEmbeddingProvider', () => {
  test('returns vectors in input order with dimensions + usage', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: {
        model: 'text-embedding-3-small',
        data: [
          { embedding: [0.1, 0.2, 0.3], index: 0 },
          { embedding: [0.4, 0.5, 0.6], index: 1 },
        ],
        usage: { total_tokens: 10 },
      },
    });
    const provider = createOpenAiEmbeddingProvider({ apiKey: 'sk-x', fetchImpl });
    const result = await provider.embed({ texts: ['hello', 'world'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.embeddings).toHaveLength(2);
      expect(result.value.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.value.dimensions).toBe(3);
      expect(result.value.usage?.totalTokens).toBe(10);
    }
  });

  test('reorders out-of-order responses by index', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: {
        data: [
          { embedding: [1], index: 1 },
          { embedding: [0], index: 0 },
        ],
      },
    });
    const provider = createOpenAiEmbeddingProvider({ apiKey: 'k', fetchImpl });
    const result = await provider.embed({ texts: ['a', 'b'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.embeddings[0]).toEqual([0]);
      expect(result.value.embeddings[1]).toEqual([1]);
    }
  });

  test('sends bearer auth + json body to openai endpoint', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit = {};
    const fetchImpl = fakeFetch({
      status: 200,
      body: { data: [{ embedding: [0], index: 0 }] },
      capture: (url, init) => {
        capturedUrl = url;
        capturedInit = init;
      },
    });
    const provider = createOpenAiEmbeddingProvider({
      apiKey: 'sk-x',
      fetchImpl,
      model: 'custom',
    });
    await provider.embed({ texts: ['hi'] });
    expect(capturedUrl).toContain('openai.com');
    const headers = capturedInit.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer sk-x');
    const body = JSON.parse(String(capturedInit.body));
    expect(body.model).toBe('custom');
    expect(body.input).toEqual(['hi']);
  });

  test('rejects empty texts', async () => {
    const provider = createOpenAiEmbeddingProvider({ apiKey: 'k' });
    const result = await provider.embed({ texts: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('VALIDATION_ERROR');
  });

  test('401 maps to AUTH_ERROR invalid_token', async () => {
    const fetchImpl = fakeFetch({ status: 401, body: 'unauthorized' });
    const provider = createOpenAiEmbeddingProvider({ apiKey: 'bad', fetchImpl });
    const result = await provider.embed({ texts: ['x'] });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.type === 'AUTH_ERROR') {
      expect(result.error.reason).toBe('invalid_token');
    }
  });

  test('429 maps to RATE_LIMIT_ERROR', async () => {
    const fetchImpl = fakeFetch({ status: 429, body: 'slow down' });
    const provider = createOpenAiEmbeddingProvider({ apiKey: 'k', fetchImpl });
    const result = await provider.embed({ texts: ['x'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('RATE_LIMIT_ERROR');
  });

  test('empty data array returns INTERNAL_ERROR', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { data: [] } });
    const provider = createOpenAiEmbeddingProvider({ apiKey: 'k', fetchImpl });
    const result = await provider.embed({ texts: ['x'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('INTERNAL_ERROR');
  });
});
