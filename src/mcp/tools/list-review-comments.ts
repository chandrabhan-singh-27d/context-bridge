import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildCacheKey } from '../../cache/cache-key.ts';
import { TTL_REVIEW_COMMENTS_MS } from '../../cache/ttl.ts';
import { withCache } from '../../cache/with-cache.ts';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { issueNumber, repoCoordsSchema } from '../../github/schemas.ts';
import type { TieredCache } from '../../lib/cache/tiered-cache.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { ok, type Result, tryCatch } from '../../lib/result.ts';

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

export function registerListReviewComments(
  server: McpServer,
  client: GitHubClient,
  cache: TieredCache | null,
): void {
  server.tool(
    'list_review_comments',
    'List inline review comments on a pull request. Returns author, body, file path, line, side, commit SHA, and reply-thread linkage. Read-only.',
    listReviewCommentsInputSchema,
    async (args) => {
      const run = (): Promise<Result<ReadonlyArray<ReviewComment>, AppError>> =>
        listReviewCommentsHandler(client, args);
      const r =
        cache === null
          ? await run()
          : await withCache(
              cache,
              buildCacheKey({
                endpoint: 'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
                owner: args.owner,
                repo: args.repo,
                params: { number: args.number, limit: args.limit },
              }),
              TTL_REVIEW_COMMENTS_MS,
              run,
            );
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
