import { describe, expect, test } from 'bun:test';
import { createVoyageEmbeddingProvider } from './voyage.ts';

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

describe('createVoyageEmbeddingProvider', () => {
  test('returns vectors with model metadata', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: {
        model: 'voyage-3',
        data: [{ embedding: [0.1, 0.2], index: 0 }],
        usage: { total_tokens: 5 },
      },
    });
    const provider = createVoyageEmbeddingProvider({ apiKey: 'pa-x', fetchImpl });
    const result = await provider.embed({ texts: ['hello'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.embeddings[0]).toEqual([0.1, 0.2]);
      expect(result.value.model).toBe('voyage-3');
      expect(result.value.dimensions).toBe(2);
      expect(result.value.usage?.totalTokens).toBe(5);
    }
  });

  test('sends bearer auth to voyage endpoint', async () => {
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
    const provider = createVoyageEmbeddingProvider({
      apiKey: 'pa-secret',
      fetchImpl,
      model: 'voyage-3-lite',
    });
    await provider.embed({ texts: ['x'] });
    expect(capturedUrl).toContain('voyageai.com');
    const headers = capturedInit.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer pa-secret');
    const body = JSON.parse(String(capturedInit.body));
    expect(body.model).toBe('voyage-3-lite');
  });

  test('rejects empty texts', async () => {
    const provider = createVoyageEmbeddingProvider({ apiKey: 'k' });
    const result = await provider.embed({ texts: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('VALIDATION_ERROR');
  });

  test('401 maps to AUTH_ERROR invalid_token', async () => {
    const fetchImpl = fakeFetch({ status: 401, body: 'unauthorized' });
    const provider = createVoyageEmbeddingProvider({ apiKey: 'bad', fetchImpl });
    const result = await provider.embed({ texts: ['x'] });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.type === 'AUTH_ERROR') {
      expect(result.error.reason).toBe('invalid_token');
    }
  });

  test('exposes name and model', () => {
    const provider = createVoyageEmbeddingProvider({ apiKey: 'k', model: 'voyage-2' });
    expect(provider.name).toBe('voyage');
    expect(provider.model).toBe('voyage-2');
  });
});
