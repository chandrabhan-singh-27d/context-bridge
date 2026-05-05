import type { Env } from '../config/env.ts';
import { createAnthropicProvider } from './anthropic.ts';
import { createGroqProvider } from './groq.ts';
import { createOpenAiProvider } from './openai.ts';
import type { LlmProvider } from './provider.ts';

/**
 * Build an LlmProvider from validated env. Returns null when no API key is
 * configured — LLM-using tools must accept `LlmProvider | null` and degrade.
 *
 * Adding a provider:
 *   1. New adapter file in src/llm/<name>.ts implementing LlmProvider.
 *   2. Append name to LlmProviderName enum in src/config/env.ts.
 *   3. One arm in the switch below.
 */
export function buildProvider(
  env: Pick<Env, 'LLM_PROVIDER' | 'LLM_API_KEY' | 'LLM_MODEL'>,
): LlmProvider | null {
  const apiKey = env.LLM_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return null;

  const overrideModel = env.LLM_MODEL !== undefined ? { model: env.LLM_MODEL } : {};

  switch (env.LLM_PROVIDER) {
    case 'groq':
      return createGroqProvider({ apiKey, ...overrideModel });
    case 'openai':
      return createOpenAiProvider({ apiKey, ...overrideModel });
    case 'anthropic':
      return createAnthropicProvider({ apiKey, ...overrideModel });
  }
}
