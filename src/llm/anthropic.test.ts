import { describe, expect, test } from 'bun:test';
import { createAnthropicProvider } from './anthropic.ts';

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

describe('createAnthropicProvider', () => {
  test('successful chat returns Ok with content + usage', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: {
        model: 'claude-haiku-4-5-20251001',
        content: [{ type: 'text', text: 'hello' }],
        usage: { input_tokens: 11, output_tokens: 3 },
      },
    });
    const provider = createAnthropicProvider({ apiKey: 'sk-ant', fetchImpl });
    const result = await provider.chat({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('hello');
      expect(result.value.usage?.promptTokens).toBe(11);
      expect(result.value.usage?.completionTokens).toBe(3);
    }
  });

  test('partitions system messages into Anthropic top-level system field', async () => {
    let capturedInit: RequestInit = {};
    const fetchImpl = fakeFetch({
      status: 200,
      body: { content: [{ type: 'text', text: 'ok' }] },
      capture: (_url, init) => {
        capturedInit = init;
      },
    });
    const provider = createAnthropicProvider({ apiKey: 'k', fetchImpl });
    await provider.chat({
      messages: [
        { role: 'system', content: 'you are helpful' },
        { role: 'user', content: 'hi' },
      ],
    });
    const body = JSON.parse(String(capturedInit.body));
    expect(body.system).toBe('you are helpful');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  test('sends x-api-key + anthropic-version headers', async () => {
    let capturedInit: RequestInit = {};
    const fetchImpl = fakeFetch({
      status: 200,
      body: { content: [{ type: 'text', text: 'ok' }] },
      capture: (_url, init) => {
        capturedInit = init;
      },
    });
    const provider = createAnthropicProvider({ apiKey: 'sk-ant-secret', fetchImpl });
    await provider.chat({ messages: [{ role: 'user', content: 'x' }], maxTokens: 100 });
    const headers = capturedInit.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-secret');
    expect(headers['anthropic-version']).toBeDefined();
    expect(headers['authorization']).toBeUndefined();
    const body = JSON.parse(String(capturedInit.body));
    expect(body.max_tokens).toBe(100);
  });

  test('applies default max_tokens when caller omits it', async () => {
    let capturedInit: RequestInit = {};
    const fetchImpl = fakeFetch({
      status: 200,
      body: { content: [{ type: 'text', text: 'ok' }] },
      capture: (_url, init) => {
        capturedInit = init;
      },
    });
    const provider = createAnthropicProvider({ apiKey: 'k', fetchImpl });
    await provider.chat({ messages: [{ role: 'user', content: 'x' }] });
    const body = JSON.parse(String(capturedInit.body));
    expect(typeof body.max_tokens).toBe('number');
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  test('401 maps to AUTH_ERROR invalid_token', async () => {
    const fetchImpl = fakeFetch({ status: 401, body: 'unauthorized' });
    const provider = createAnthropicProvider({ apiKey: 'bad', fetchImpl });
    const result = await provider.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.type === 'AUTH_ERROR') {
      expect(result.error.reason).toBe('invalid_token');
    }
  });

  test('429 maps to RATE_LIMIT_ERROR', async () => {
    const fetchImpl = fakeFetch({ status: 429, body: 'slow down' });
    const provider = createAnthropicProvider({ apiKey: 'k', fetchImpl });
    const result = await provider.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('RATE_LIMIT_ERROR');
  });

  test('malformed response (no text block) returns INTERNAL_ERROR', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { content: [] } });
    const provider = createAnthropicProvider({ apiKey: 'k', fetchImpl });
    const result = await provider.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('INTERNAL_ERROR');
  });

  test('exposes name and model', () => {
    const provider = createAnthropicProvider({ apiKey: 'k', model: 'claude-test' });
    expect(provider.name).toBe('anthropic');
    expect(provider.model).toBe('claude-test');
  });
});
