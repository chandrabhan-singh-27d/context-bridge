import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import type { RepoCoords } from '../../github/schemas.ts';
import { registerReadmeResource } from './readme.ts';
import { registerRecentActivityResource } from './recent-activity.ts';
import { registerStructureResource } from './structure.ts';

export interface ResourceDeps {
  readonly github: GitHubClient;
  readonly defaultRepo: RepoCoords;
}

export function registerResources(server: McpServer, deps: ResourceDeps): void {
  registerReadmeResource(server, deps.github, deps.defaultRepo);
  registerStructureResource(server, deps.github, deps.defaultRepo);
  registerRecentActivityResource(server, deps.github, deps.defaultRepo);
}
