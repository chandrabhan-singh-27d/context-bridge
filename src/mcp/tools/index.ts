import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import type { TieredCache } from '../../lib/cache/tiered-cache.ts';
import type { LlmProvider } from '../../llm/provider.ts';
import { registerCommentOnIssue } from './comment-on-issue.ts';
import { registerCommentOnPr } from './comment-on-pr.ts';
import { registerCommitFiles } from './commit-files.ts';
import { registerCreateBranch } from './create-branch.ts';
import { registerGetCiStatus } from './get-ci-status.ts';
import { registerGetCommitHistory } from './get-commit-history.ts';
import { registerGetPrDiff } from './get-pr-diff.ts';
import { registerGetPullRequest } from './get-pull-request.ts';
import { registerGetRepoInfo } from './get-repo-info.ts';
import { registerLabelIssue } from './label-issue.ts';
import { registerListReviewComments } from './list-review-comments.ts';
import { registerOpenPr } from './open-pr.ts';
import { registerPing } from './ping.ts';
import { registerSearchCode } from './search-code.ts';
import { registerSearchIssues } from './search-issues.ts';
import { registerSummarizeIssue } from './summarize-issue.ts';
import { registerTriagePr } from './triage-pr.ts';

export interface ToolDeps {
  readonly github: GitHubClient;
  readonly cache: TieredCache | null;
  readonly writesEnabled: boolean;
  readonly llm: LlmProvider | null;
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

  if (deps.writesEnabled) {
    registerCommentOnIssue(server, deps.github);
    registerCommentOnPr(server, deps.github);
    registerLabelIssue(server, deps.github);
    registerCreateBranch(server, deps.github);
    registerCommitFiles(server, deps.github);
    registerOpenPr(server, deps.github);
  }

  if (deps.llm !== null) {
    registerSummarizeIssue(server, deps.github, deps.llm);
    registerTriagePr(server, deps.github, deps.llm);
  }
}
