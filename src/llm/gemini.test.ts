import { describe, expect, test } from 'bun:test';
import { createGeminiProvider } from './gemini.ts';

function mockFetch(status: number, body: unknown, headers?: Record<string, string>): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })) as unknown as typeof fetch;
}

describe('createGeminiProvider', () => {
  test('successful chat returns Ok with content + usage', async () => {
    const provider = createGeminiProvider({
      apiKey: 'sekret',
      fetchImpl: mockFetch(200, {
        candidates: [
          {
            content: { parts: [{ text: 'Gemini answer' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        modelVersion: 'gemini-2.0-flash',
      }),
    });
    const r = await provider.chat({ messages: [{ role: 'user', content: 'hello' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.content).toBe('Gemini answer');
    expect(r.value.model).toBe('gemini-2.0-flash');
    expect(r.value.usage?.promptTokens).toBe(10);
    expect(r.value.usage?.completionTokens).toBe(20);
  });

  test('separates system message into systemInstruction', async () => {
    let capturedUrl = '';
    let capturedBody: Record<string, unknown> = {};
    const provider = createGeminiProvider({
      apiKey: 'sekret',
      fetchImpl: (async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as unknown as typeof fetch,
    });
    await provider.chat({
      messages: [
        { role: 'system', content: 'you are a bot' },
        { role: 'user', content: 'hi' },
      ],
    });
    expect(capturedUrl).toContain('key=sekret');
    expect(capturedUrl).toContain('gemini-2.0-flash');
    expect(capturedBody['systemInstruction']).toEqual({ parts: [{ text: 'you are a bot' }] });
    expect(capturedBody['contents']).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }]);
  });

  test('maps assistant role to model role', async () => {
    let capturedBody: Record<string, unknown> = {};
    const provider = createGeminiProvider({
      apiKey: 'sekret',
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as unknown as typeof fetch,
    });
    await provider.chat({
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });
    const contents = capturedBody['contents'] as Array<{ role: string }>;
    expect(contents[1]?.role).toBe('model');
  });

  test('401 maps to AUTH_ERROR invalid_token', async () => {
    const provider = createGeminiProvider({
      apiKey: 'bad',
      fetchImpl: mockFetch(401, { error: { message: 'API key not valid' } }),
    });
    const r = await provider.chat({ messages: [{ role: 'user', content: 'hi' }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('AUTH_ERROR');
  });

  test('429 maps to RATE_LIMIT_ERROR', async () => {
    const provider = createGeminiProvider({
      apiKey: 'sekret',
      fetchImpl: mockFetch(429, { error: { message: 'rate limited' } }),
    });
    const r = await provider.chat({ messages: [{ role: 'user', content: 'hi' }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('RATE_LIMIT_ERROR');
  });

  test('empty response returns INTERNAL_ERROR', async () => {
    const provider = createGeminiProvider({
      apiKey: 'sekret',
      fetchImpl: mockFetch(200, { candidates: [] }),
    });
    const r = await provider.chat({ messages: [{ role: 'user', content: 'hi' }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('INTERNAL_ERROR');
  });

  test('exposes name and model', () => {
    const provider = createGeminiProvider({ apiKey: 'sekret' });
    expect(provider.name).toBe('gemini');
    expect(provider.model).toBe('gemini-2.0-flash');
  });
});
