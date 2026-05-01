import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import { registerGetRepoInfo } from './get-repo-info.ts';
import { registerPing } from './ping.ts';

export interface ToolDeps {
  readonly github: GitHubClient;
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
  registerPing(server);
  registerGetRepoInfo(server, deps.github);
  // Future tools register here. Each tool owns its own file + tests.
}
