import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { ok, type Result, tryCatch } from '../../lib/result.ts';
import { commentBody, issueCoords } from './write-schemas.ts';

export const commentOnIssueInputSchema = {
  ...issueCoords,
  body: commentBody,
};

export interface CommentOnIssueInput {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly body: string;
}

export interface CommentOnIssueResult {
  readonly id: number;
  readonly htmlUrl: string;
}

export async function commentOnIssueHandler(
  client: GitHubClient,
  input: CommentOnIssueInput,
): Promise<Result<CommentOnIssueResult, AppError>> {
  const endpoint = `POST /repos/${input.owner}/${input.repo}/issues/${input.number}/comments`;
  const r = await tryCatch(
    () =>
      client.rest.issues.createComment({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.number,
        body: input.body,
      }),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!r.ok) return r;
  return ok({ id: r.value.data.id, htmlUrl: r.value.data.html_url });
}

export function registerCommentOnIssue(server: McpServer, client: GitHubClient): void {
  server.tool(
    'comment_on_issue',
    'Post a comment on a GitHub issue. Write surface — requires WRITES_ENABLED.',
    commentOnIssueInputSchema,
    async (args) => {
      const r = await commentOnIssueHandler(client, args);
      if (!r.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(r.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(r.value, null, 2) }] };
    },
  );
}
