import { describe, expect, test } from 'bun:test';
import { createGroqProvider } from './groq.ts';

function fakeFetch(response: {
  status: number;
  body: unknown;
  capture?: (url: string, init: RequestInit) => void;
}): typeof fetch {
  return (async (url: string | URL | Request, init: RequestInit = {}) => {
    response.capture?.(String(url), init);
    return new Response(
      typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
      {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;
}

describe('createGroqProvider', () => {
  test('successful chat returns Ok with content + usage', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: {
        model: 'llama-3.3-70b-versatile',
        choices: [{ message: { content: 'hello world' } }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      },
    });
    const p = createGroqProvider({ apiKey: 'k', fetchImpl });
    const r = await p.chat({ messages: [{ role: 'user', content: 'hi' }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.content).toBe('hello world');
      expect(r.value.model).toBe('llama-3.3-70b-versatile');
      expect(r.value.usage?.promptTokens).toBe(12);
      expect(r.value.usage?.completionTokens).toBe(3);
    }
  });

  test('sends bearer auth + json body to groq endpoint', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit = {};
    const fetchImpl = fakeFetch({
      status: 200,
      body: { choices: [{ message: { content: 'ok' } }] },
      capture: (u, i) => {
        capturedUrl = u;
        capturedInit = i;
      },
    });
    const p = createGroqProvider({ apiKey: 'sekret', fetchImpl, model: 'custom-m' });
    await p.chat({ messages: [{ role: 'user', content: 'q' }], maxTokens: 50 });
    expect(capturedUrl).toContain('groq.com');
    const headers = capturedInit.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer sekret');
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(String(capturedInit.body));
    expect(body.model).toBe('custom-m');
    expect(body.messages).toEqual([{ role: 'user', content: 'q' }]);
    expect(body.max_tokens).toBe(50);
  });

  test('401 maps to AUTH_ERROR invalid_token', async () => {
    const fetchImpl = fakeFetch({ status: 401, body: 'unauthorized' });
    const p = createGroqProvider({ apiKey: 'bad', fetchImpl });
    const r = await p.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.type).toBe('AUTH_ERROR');
      if (r.error.type === 'AUTH_ERROR') expect(r.error.reason).toBe('invalid_token');
    }
  });

  test('429 maps to RATE_LIMIT_ERROR', async () => {
    const fetchImpl = fakeFetch({ status: 429, body: 'slow down' });
    const p = createGroqProvider({ apiKey: 'k', fetchImpl });
    const r = await p.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('RATE_LIMIT_ERROR');
  });

  test('5xx maps to GITHUB_API_ERROR with status', async () => {
    const fetchImpl = fakeFetch({ status: 503, body: 'down' });
    const p = createGroqProvider({ apiKey: 'k', fetchImpl });
    const r = await p.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.type === 'GITHUB_API_ERROR') expect(r.error.status).toBe(503);
  });

  test('malformed response (no choices) returns INTERNAL_ERROR', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { model: 'x' } });
    const p = createGroqProvider({ apiKey: 'k', fetchImpl });
    const r = await p.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('INTERNAL_ERROR');
  });

  test('exposes name and model', () => {
    const p = createGroqProvider({ apiKey: 'k', model: 'm-1' });
    expect(p.name).toBe('groq');
    expect(p.model).toBe('m-1');
  });
});
