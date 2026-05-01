import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { issueNumber, repoCoordsSchema } from '../../github/schemas.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { type Result, ok, tryCatch } from '../../lib/result.ts';

export const getPullRequestInputSchema = {
  ...repoCoordsSchema,
  number: issueNumber,
};

export interface GetPullRequestInput {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
}

export interface PullRequestSummary {
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly state: string;
  readonly draft: boolean;
  readonly merged: boolean;
  readonly mergeable: boolean | null;
  readonly author: string | null;
  readonly baseRef: string;
  readonly headRef: string;
  readonly headSha: string;
  readonly additions: number;
  readonly deletions: number;
  readonly changedFiles: number;
  readonly commits: number;
  readonly comments: number;
  readonly reviewComments: number;
  readonly labels: ReadonlyArray<string>;
  readonly htmlUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly mergedAt: string | null;
  readonly closedAt: string | null;
}

export async function getPullRequestHandler(
  client: GitHubClient,
  input: GetPullRequestInput,
): Promise<Result<PullRequestSummary, AppError>> {
  const endpoint = `GET /repos/${input.owner}/${input.repo}/pulls/${input.number}`;
  const r = await tryCatch(
    () =>
      client.rest.pulls.get({
        owner: input.owner,
        repo: input.repo,
        pull_number: input.number,
      }),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!r.ok) return r;
  const d = r.value.data;
  return ok({
    number: d.number,
    title: d.title,
    body: d.body,
    state: d.state,
    draft: d.draft ?? false,
    merged: d.merged,
    mergeable: d.mergeable,
    author: d.user?.login ?? null,
    baseRef: d.base.ref,
    headRef: d.head.ref,
    headSha: d.head.sha,
    additions: d.additions,
    deletions: d.deletions,
    changedFiles: d.changed_files,
    commits: d.commits,
    comments: d.comments,
    reviewComments: d.review_comments,
    labels: d.labels.map((l) => l.name),
    htmlUrl: d.html_url,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    mergedAt: d.merged_at,
    closedAt: d.closed_at,
  });
}

export function registerGetPullRequest(server: McpServer, client: GitHubClient): void {
  server.tool(
    'get_pull_request',
    'Fetch metadata for a pull request: title, body, state, branches, head SHA, additions/deletions, comment + review counts, labels. Read-only.',
    getPullRequestInputSchema,
    async (args) => {
      const r = await getPullRequestHandler(client, args);
      if (!r.ok) {
        return {
          isError: true,
          content: [{ type: 'text', text: formatAppError(r.error) }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(r.value, null, 2) }],
      };
    },
  );
}
