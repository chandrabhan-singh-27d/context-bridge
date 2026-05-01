import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import { registerGetPrDiff } from './get-pr-diff.ts';
import { registerGetPullRequest } from './get-pull-request.ts';
import { registerGetRepoInfo } from './get-repo-info.ts';
import { registerListReviewComments } from './list-review-comments.ts';
import { registerPing } from './ping.ts';
import { registerSearchIssues } from './search-issues.ts';

export interface ToolDeps {
  readonly github: GitHubClient;
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
  registerPing(server);
  registerGetRepoInfo(server, deps.github);
  registerSearchIssues(server, deps.github);
  registerGetPullRequest(server, deps.github);
  registerGetPrDiff(server, deps.github);
  registerListReviewComments(server, deps.github);
}
