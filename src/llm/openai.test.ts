import { describe, expect, test } from 'bun:test';
import { createOpenAiProvider } from './openai.ts';

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

describe('createOpenAiProvider', () => {
  test('successful chat returns Ok with content + usage', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: {
        model: 'gpt-4o-mini',
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 9, completion_tokens: 2 },
      },
    });
    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl });
    const result = await provider.chat({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('hello');
      expect(result.value.model).toBe('gpt-4o-mini');
      expect(result.value.usage?.promptTokens).toBe(9);
    }
  });

  test('sends bearer auth + json body to openai endpoint', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit = {};
    const fetchImpl = fakeFetch({
      status: 200,
      body: { choices: [{ message: { content: 'ok' } }] },
      capture: (url, init) => {
        capturedUrl = url;
        capturedInit = init;
      },
    });
    const provider = createOpenAiProvider({ apiKey: 'sk-x', fetchImpl, model: 'custom-model' });
    await provider.chat({ messages: [{ role: 'user', content: 'q' }], maxTokens: 50 });
    expect(capturedUrl).toContain('openai.com');
    const headers = capturedInit.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer sk-x');
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(String(capturedInit.body));
    expect(body.model).toBe('custom-model');
    expect(body.max_tokens).toBe(50);
  });

  test('401 maps to AUTH_ERROR invalid_token', async () => {
    const fetchImpl = fakeFetch({ status: 401, body: 'unauthorized' });
    const provider = createOpenAiProvider({ apiKey: 'bad', fetchImpl });
    const result = await provider.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.type === 'AUTH_ERROR') {
      expect(result.error.reason).toBe('invalid_token');
    }
  });

  test('429 maps to RATE_LIMIT_ERROR', async () => {
    const fetchImpl = fakeFetch({ status: 429, body: 'slow down' });
    const provider = createOpenAiProvider({ apiKey: 'k', fetchImpl });
    const result = await provider.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('RATE_LIMIT_ERROR');
  });

  test('malformed response (no choices) returns INTERNAL_ERROR', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { model: 'x' } });
    const provider = createOpenAiProvider({ apiKey: 'k', fetchImpl });
    const result = await provider.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('INTERNAL_ERROR');
  });

  test('exposes name and model', () => {
    const provider = createOpenAiProvider({ apiKey: 'k', model: 'm-1' });
    expect(provider.name).toBe('openai');
    expect(provider.model).toBe('m-1');
  });
});
