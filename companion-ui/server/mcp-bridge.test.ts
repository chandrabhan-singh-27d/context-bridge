import { afterAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { createMcpBridge } from './mcp-bridge.ts';

const FAKE = resolve(import.meta.dir, 'fixtures/fake-mcp-server.ts');

describe('mcp bridge', () => {
  const bridge = createMcpBridge({
    command: 'bun',
    args: ['run', FAKE],
    requestTimeoutMs: 5_000,
  });

  afterAll(async () => {
    await bridge.shutdown();
  });

  test('initialize succeeds', async () => {
    const r = await bridge.initialize();
    expect(r.ok).toBe(true);
  });

  test('listTools returns expected tools', async () => {
    const r = await bridge.listTools();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const names = r.value.tools.map((t) => (t as { name: string }).name);
    expect(names).toContain('ping');
    expect(names).toContain('echo');
  });

  test('callTool echoes args', async () => {
    const r = await bridge.callTool('echo', { hello: 'world' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { content: Array<{ text: string }> };
    expect(v.content[0]?.text).toContain('"hello":"world"');
  });

  test('callTool surfaces server error', async () => {
    const r = await bridge.callTool('fail', {});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('INTERNAL_ERROR');
  });
});

describe('mcp bridge — child death', () => {
  test('reports error after shutdown', async () => {
    const b = createMcpBridge({
      command: 'bun',
      args: ['run', FAKE],
      requestTimeoutMs: 2_000,
    });
    await b.initialize();
    await b.shutdown();
    const r = await b.callTool('echo', {});
    expect(r.ok).toBe(false);
  });
});
