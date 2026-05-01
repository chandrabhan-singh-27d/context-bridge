import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import type { TieredCache } from '../../lib/cache/tiered-cache.ts';
import { registerGetCiStatus } from './get-ci-status.ts';
import { registerGetCommitHistory } from './get-commit-history.ts';
import { registerGetPrDiff } from './get-pr-diff.ts';
import { registerGetPullRequest } from './get-pull-request.ts';
import { registerGetRepoInfo } from './get-repo-info.ts';
import { registerListReviewComments } from './list-review-comments.ts';
import { registerPing } from './ping.ts';
import { registerSearchCode } from './search-code.ts';
import { registerSearchIssues } from './search-issues.ts';

export interface ToolDeps {
  readonly github: GitHubClient;
  readonly cache: TieredCache | null;
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
  registerPing(server);
  registerGetRepoInfo(server, deps.github, deps.cache);
  registerSearchIssues(server, deps.github, deps.cache);
  registerGetPullRequest(server, deps.github, deps.cache);
  registerGetPrDiff(server, deps.github, deps.cache);
  registerListReviewComments(server, deps.github, deps.cache);
  registerGetCiStatus(server, deps.github, deps.cache);
  registerGetCommitHistory(server, deps.github, deps.cache);
  registerSearchCode(server, deps.github, deps.cache);
}
