import { describe, expect, test } from 'bun:test';
import { SERVER_INFO, buildServer } from './server.ts';

describe('buildServer', () => {
  test('exposes the expected server identity', () => {
    expect(SERVER_INFO.name).toBe('context-bridge');
    expect(SERVER_INFO.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('returns a usable McpServer instance', () => {
    const server = buildServer();
    expect(server).toBeDefined();
    // McpServer exposes `.connect(transport)` — sanity check the API surface
    // we depend on is present so a future SDK rename surfaces here.
    expect(typeof server.connect).toBe('function');
  });
});
