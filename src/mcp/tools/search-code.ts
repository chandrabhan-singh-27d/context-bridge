import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildCacheKey } from '../../cache/cache-key.ts';
import { TTL_SEARCH_CODE_MS } from '../../cache/ttl.ts';
import { withCache } from '../../cache/with-cache.ts';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { repoCoordsSchema } from '../../github/schemas.ts';
import type { TieredCache } from '../../lib/cache/tiered-cache.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { ok, type Result, tryCatch } from '../../lib/result.ts';

export const searchCodeInputSchema = {
  ...repoCoordsSchema,
  query: z
    .string()
    .min(1)
    .max(256)
    .refine((q) => !/\b(repo|org|user|in):/i.test(q), {
      message: 'query must not contain repo:/org:/user:/in: qualifiers (scope is fixed)',
    }),
  limit: z.number().int().min(1).max(100).default(30),
};

export interface SearchCodeInput {
  readonly owner: string;
  readonly repo: string;
  readonly query: string;
  readonly limit: number;
}

export interface CodeMatch {
  readonly path: string;
  readonly name: string;
  readonly sha: string;
  readonly htmlUrl: string;
  readonly score: number;
}

export interface SearchCodeResult {
  readonly totalCount: number;
  readonly incompleteResults: boolean;
  readonly items: ReadonlyArray<CodeMatch>;
}

function buildQuery(input: SearchCodeInput): string {
  return `${input.query} repo:${input.owner}/${input.repo}`;
}

export async function searchCodeHandler(
  client: GitHubClient,
  input: SearchCodeInput,
): Promise<Result<SearchCodeResult, AppError>> {
  const q = buildQuery(input);
  const endpoint = 'GET /search/code';
  const r = await tryCatch(
    () => client.rest.search.code({ q, per_page: input.limit }),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!r.ok) return r;
  const d = r.value.data;
  return ok({
    totalCount: d.total_count,
    incompleteResults: d.incomplete_results,
    items: d.items.map((i) => ({
      path: i.path,
      name: i.name,
      sha: i.sha,
      htmlUrl: i.html_url,
      score: i.score,
    })),
  });
}

export function registerSearchCode(
  server: McpServer,
  client: GitHubClient,
  cache: TieredCache | null,
): void {
  server.tool(
    'search_code',
    'Search code in a GitHub repository by free-text query. Note: GitHub code-search rate limit is lower (30/min) than core API. Read-only.',
    searchCodeInputSchema,
    async (args) => {
      const run = (): Promise<Result<SearchCodeResult, AppError>> =>
        searchCodeHandler(client, args);
      const r =
        cache === null
          ? await run()
          : await withCache(
              cache,
              buildCacheKey({
                endpoint: 'GET /search/code',
                owner: args.owner,
                repo: args.repo,
                params: { query: args.query, limit: args.limit },
              }),
              TTL_SEARCH_CODE_MS,
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
