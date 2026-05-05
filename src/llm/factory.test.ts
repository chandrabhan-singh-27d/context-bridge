import { describe, expect, test } from 'bun:test';
import { buildProvider } from './factory.ts';

describe('buildProvider', () => {
  test('returns null when LLM_API_KEY absent', () => {
    expect(buildProvider({ LLM_PROVIDER: 'groq' })).toBeNull();
  });

  test('returns null when LLM_API_KEY empty', () => {
    expect(buildProvider({ LLM_PROVIDER: 'groq', LLM_API_KEY: '' })).toBeNull();
  });

  test('returns groq adapter when configured', () => {
    const p = buildProvider({ LLM_PROVIDER: 'groq', LLM_API_KEY: 'k' });
    expect(p).not.toBeNull();
    expect(p?.name).toBe('groq');
  });

  test('honors LLM_MODEL override', () => {
    const p = buildProvider({ LLM_PROVIDER: 'groq', LLM_API_KEY: 'k', LLM_MODEL: 'custom' });
    expect(p?.model).toBe('custom');
  });

  test('uses default model when LLM_MODEL absent', () => {
    const p = buildProvider({ LLM_PROVIDER: 'groq', LLM_API_KEY: 'k' });
    expect(p?.model).toBeTruthy();
  });

  test('returns openai adapter when configured', () => {
    const p = buildProvider({ LLM_PROVIDER: 'openai', LLM_API_KEY: 'sk-x' });
    expect(p?.name).toBe('openai');
    expect(p?.model).toBeTruthy();
  });

  test('returns anthropic adapter when configured', () => {
    const p = buildProvider({ LLM_PROVIDER: 'anthropic', LLM_API_KEY: 'sk-ant' });
    expect(p?.name).toBe('anthropic');
    expect(p?.model).toBeTruthy();
  });

  test('LLM_MODEL override applies across providers', () => {
    const openai = buildProvider({
      LLM_PROVIDER: 'openai',
      LLM_API_KEY: 'k',
      LLM_MODEL: 'gpt-x',
    });
    const anthropic = buildProvider({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'k',
      LLM_MODEL: 'claude-x',
    });
    expect(openai?.model).toBe('gpt-x');
    expect(anthropic?.model).toBe('claude-x');
  });
});
