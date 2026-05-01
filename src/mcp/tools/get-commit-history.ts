import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { repoCoordsSchema } from '../../github/schemas.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { type Result, ok, tryCatch } from '../../lib/result.ts';

export const getCommitHistoryInputSchema = {
  ...repoCoordsSchema,
  ref: z.string().min(1).max(255).optional(),
  path: z.string().min(1).max(500).optional(),
  author: z.string().min(1).max(100).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(30),
};

export interface GetCommitHistoryInput {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string | undefined;
  readonly path: string | undefined;
  readonly author: string | undefined;
  readonly since: string | undefined;
  readonly until: string | undefined;
  readonly limit: number;
}

export interface CommitSummary {
  readonly sha: string;
  readonly message: string;
  readonly author: string | null;
  readonly authorEmail: string | null;
  readonly authorDate: string | null;
  readonly committer: string | null;
  readonly htmlUrl: string;
  readonly parentShas: ReadonlyArray<string>;
}

export async function getCommitHistoryHandler(
  client: GitHubClient,
  input: GetCommitHistoryInput,
): Promise<Result<ReadonlyArray<CommitSummary>, AppError>> {
  const endpoint = `GET /repos/${input.owner}/${input.repo}/commits`;
  const params: {
    owner: string;
    repo: string;
    per_page: number;
    sha?: string;
    path?: string;
    author?: string;
    since?: string;
    until?: string;
  } = {
    owner: input.owner,
    repo: input.repo,
    per_page: input.limit,
  };
  if (input.ref !== undefined) params.sha = input.ref;
  if (input.path !== undefined) params.path = input.path;
  if (input.author !== undefined) params.author = input.author;
  if (input.since !== undefined) params.since = input.since;
  if (input.until !== undefined) params.until = input.until;

  const r = await tryCatch(
    () => client.rest.repos.listCommits(params),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!r.ok) return r;
  return ok(
    r.value.data.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author?.name ?? null,
      authorEmail: c.commit.author?.email ?? null,
      authorDate: c.commit.author?.date ?? null,
      committer: c.commit.committer?.name ?? null,
      htmlUrl: c.html_url,
      parentShas: c.parents.map((p) => p.sha ?? '').filter((s) => s !== ''),
    })),
  );
}

export function registerGetCommitHistory(server: McpServer, client: GitHubClient): void {
  server.tool(
    'get_commit_history',
    'List commits for a repository. Optional filters: ref (branch/sha), path, author, since/until (ISO datetime). Read-only.',
    getCommitHistoryInputSchema,
    async (args) => {
      const r = await getCommitHistoryHandler(client, args);
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
