import type { Env } from '../config/env.ts';
import { createOpenAiEmbeddingProvider } from './openai.ts';
import type { EmbeddingProvider } from './provider.ts';
import { createVoyageEmbeddingProvider } from './voyage.ts';

/**
 * Build an EmbeddingProvider from validated env. Returns null when no API
 * key is configured — consumers must accept `EmbeddingProvider | null` and
 * degrade gracefully (or skip registering RAG-style features entirely).
 *
 * Adding a provider:
 *   1. New adapter file in src/embeddings/<name>.ts implementing EmbeddingProvider.
 *   2. Append name to EmbeddingProviderName enum in src/config/env.ts.
 *   3. One arm in the switch below.
 */
export function buildEmbeddingProvider(
  env: Pick<Env, 'EMBEDDING_PROVIDER' | 'EMBEDDING_API_KEY' | 'EMBEDDING_MODEL'>,
): EmbeddingProvider | null {
  const apiKey = env.EMBEDDING_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return null;

  const overrideModel = env.EMBEDDING_MODEL !== undefined ? { model: env.EMBEDDING_MODEL } : {};

  switch (env.EMBEDDING_PROVIDER) {
    case 'openai':
      return createOpenAiEmbeddingProvider({ apiKey, ...overrideModel });
    case 'voyage':
      return createVoyageEmbeddingProvider({ apiKey, ...overrideModel });
  }
}
