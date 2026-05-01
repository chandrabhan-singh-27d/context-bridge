import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../github/client.ts';
import type { RepoCoords } from '../github/schemas.ts';
import type { TieredCache } from '../lib/cache/tiered-cache.ts';
import { registerPrompts } from './prompts/index.ts';
import { registerResources } from './resources/index.ts';
import { registerTools } from './tools/index.ts';

export const SERVER_INFO = {
  name: 'context-bridge',
  version: '0.0.1',
} as const;

export interface ServerDeps {
  readonly github: GitHubClient;
  readonly defaultRepo: RepoCoords | null;
  readonly cache: TieredCache | null;
}

export function buildServer(deps: ServerDeps): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerTools(server, { github: deps.github, cache: deps.cache });
  registerPrompts(server);
  if (deps.defaultRepo !== null) {
    registerResources(server, { github: deps.github, defaultRepo: deps.defaultRepo });
  }
  return server;
}
