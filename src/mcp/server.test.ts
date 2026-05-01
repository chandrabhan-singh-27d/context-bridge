import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../github/client.ts';
import { SERVER_INFO, buildServer } from './server.ts';

const stubGitHub = {} as unknown as GitHubClient;

describe('buildServer', () => {
  test('exposes the expected server identity', () => {
    expect(SERVER_INFO.name).toBe('context-bridge');
    expect(SERVER_INFO.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('returns a usable McpServer instance', () => {
    const server = buildServer({ github: stubGitHub, defaultRepo: null, cache: null });
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe('function');
  });
});
