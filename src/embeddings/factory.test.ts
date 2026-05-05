import { describe, expect, test } from 'bun:test';
import { buildEmbeddingProvider } from './factory.ts';

describe('buildEmbeddingProvider', () => {
  test('returns null when EMBEDDING_API_KEY absent', () => {
    expect(buildEmbeddingProvider({ EMBEDDING_PROVIDER: 'openai' })).toBeNull();
  });

  test('returns null when EMBEDDING_API_KEY empty', () => {
    expect(
      buildEmbeddingProvider({ EMBEDDING_PROVIDER: 'openai', EMBEDDING_API_KEY: '' }),
    ).toBeNull();
  });

  test('returns openai adapter when configured', () => {
    const provider = buildEmbeddingProvider({
      EMBEDDING_PROVIDER: 'openai',
      EMBEDDING_API_KEY: 'sk-x',
    });
    expect(provider?.name).toBe('openai');
    expect(provider?.model).toBeTruthy();
  });

  test('returns voyage adapter when configured', () => {
    const provider = buildEmbeddingProvider({
      EMBEDDING_PROVIDER: 'voyage',
      EMBEDDING_API_KEY: 'pa-x',
    });
    expect(provider?.name).toBe('voyage');
    expect(provider?.model).toBeTruthy();
  });

  test('EMBEDDING_MODEL override applies across providers', () => {
    const openai = buildEmbeddingProvider({
      EMBEDDING_PROVIDER: 'openai',
      EMBEDDING_API_KEY: 'k',
      EMBEDDING_MODEL: 'text-embedding-3-large',
    });
    const voyage = buildEmbeddingProvider({
      EMBEDDING_PROVIDER: 'voyage',
      EMBEDDING_API_KEY: 'k',
      EMBEDDING_MODEL: 'voyage-3-lite',
    });
    expect(openai?.model).toBe('text-embedding-3-large');
    expect(voyage?.model).toBe('voyage-3-lite');
  });
});
