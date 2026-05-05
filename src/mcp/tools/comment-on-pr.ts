import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { ok, type Result, tryCatch } from '../../lib/result.ts';
import { commentBody, issueCoords } from './write-schemas.ts';

export const commentOnPrInputSchema = {
  ...issueCoords,
  body: commentBody,
};

export interface CommentOnPrInput {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly body: string;
}

export interface CommentOnPrResult {
  readonly id: number;
  readonly htmlUrl: string;
}

export async function commentOnPrHandler(
  client: GitHubClient,
  input: CommentOnPrInput,
): Promise<Result<CommentOnPrResult, AppError>> {
  const endpoint = `POST /repos/${input.owner}/${input.repo}/issues/${input.number}/comments`;
  const posted = await tryCatch(
    () =>
      client.rest.issues.createComment({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.number,
        body: input.body,
      }),
    (cause) => mapGitHubError(cause, endpoint),
  );
  if (!posted.ok) return posted;
  return ok({ id: posted.value.data.id, htmlUrl: posted.value.data.html_url });
}

export function registerCommentOnPr(server: McpServer, client: GitHubClient): void {
  server.tool(
    'comment_on_pr',
    'Post a top-level comment on a pull request (PRs are issues for this endpoint). Write surface — requires WRITES_ENABLED.',
    commentOnPrInputSchema,
    async (args) => {
      const outcome = await commentOnPrHandler(client, args);
      if (!outcome.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(outcome.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(outcome.value, null, 2) }] };
    },
  );
}
