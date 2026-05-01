import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { issueNumber, repoCoordsSchema } from '../../github/schemas.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { type Result, ok, tryCatch } from '../../lib/result.ts';

export const listReviewCommentsInputSchema = {
  ...repoCoordsSchema,
  number: issueNumber,
  limit: z.number().int().min(1).max(100).default(30),
};

export interface ListReviewCommentsInput {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly limit: number;
}

export interface ReviewComment {
  readonly id: number;
  readonly author: string | null;
  readonly body: string;
  readonly path: string;
  readonly line: number | null;
  readonly side: 'LEFT' | 'RIGHT' | null;
  readonly commitSha: string;
  readonly htmlUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly inReplyToId: number | null;
}

export async function listReviewCommentsHandler(
  client: GitHubClient,
  input: ListReviewCommentsInput,
): Promise<Result<ReadonlyArray<ReviewComment>, AppError>> {
  const endpoint = `GET /repos/${input.owner}/${input.repo}/pulls/${input.number}/comments`;
  const r = await tryCatch(
    () =>
      client.rest.pulls.listReviewComments({
        owner: input.owner,
        repo: input.repo,
        pull_number: input.number,
        per_page: input.limit,
      }),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!r.ok) return r;
  return ok(
    r.value.data.map((c) => ({
      id: c.id,
      author: c.user?.login ?? null,
      body: c.body,
      path: c.path,
      line: c.line ?? null,
      side: (c.side as 'LEFT' | 'RIGHT' | undefined) ?? null,
      commitSha: c.commit_id,
      htmlUrl: c.html_url,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      inReplyToId: c.in_reply_to_id ?? null,
    })),
  );
}

export function registerListReviewComments(server: McpServer, client: GitHubClient): void {
  server.tool(
    'list_review_comments',
    'List inline review comments on a pull request. Returns author, body, file path, line, side, commit SHA, and reply-thread linkage. Read-only.',
    listReviewCommentsInputSchema,
    async (args) => {
      const r = await listReviewCommentsHandler(client, args);
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
