import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildCacheKey } from '../../cache/cache-key.ts';
import { TTL_SEARCH_ISSUES_MS } from '../../cache/ttl.ts';
import { withCache } from '../../cache/with-cache.ts';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { repoCoordsSchema } from '../../github/schemas.ts';
import type { TieredCache } from '../../lib/cache/tiered-cache.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { type Result, ok, tryCatch } from '../../lib/result.ts';

export const searchIssuesInputSchema = {
  ...repoCoordsSchema,
  query: z.string().min(1).max(256),
  state: z.enum(['open', 'closed', 'all']).default('open'),
  limit: z.number().int().min(1).max(100).default(30),
};

export interface SearchIssuesInput {
  readonly owner: string;
  readonly repo: string;
  readonly query: string;
  readonly state: 'open' | 'closed' | 'all';
  readonly limit: number;
}

export interface IssueSummary {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly author: string | null;
  readonly labels: ReadonlyArray<string>;
  readonly commentCount: number;
  readonly htmlUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isPullRequest: boolean;
}

export interface SearchIssuesResult {
  readonly totalCount: number;
  readonly incompleteResults: boolean;
  readonly items: ReadonlyArray<IssueSummary>;
}

function buildQuery(input: SearchIssuesInput): string {
  const parts = [`repo:${input.owner}/${input.repo}`, 'is:issue'];
  if (input.state !== 'all') parts.push(`is:${input.state}`);
  parts.push(input.query);
  return parts.join(' ');
}

export async function searchIssuesHandler(
  client: GitHubClient,
  input: SearchIssuesInput,
): Promise<Result<SearchIssuesResult, AppError>> {
  const q = buildQuery(input);
  const endpoint = 'GET /search/issues';
  const r = await tryCatch(
    () => client.rest.search.issuesAndPullRequests({ q, per_page: input.limit }),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!r.ok) return r;
  const d = r.value.data;
  return ok({
    totalCount: d.total_count,
    incompleteResults: d.incomplete_results,
    items: d.items.map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      author: i.user?.login ?? null,
      labels: i.labels.map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean),
      commentCount: i.comments,
      htmlUrl: i.html_url,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      isPullRequest: i.pull_request !== undefined,
    })),
  });
}

export function registerSearchIssues(
  server: McpServer,
  client: GitHubClient,
  cache: TieredCache | null,
): void {
  server.tool(
    'search_issues',
    'Search issues in a GitHub repository by free-text query. Filters: state (open/closed/all), limit (1-100, default 30). Read-only.',
    searchIssuesInputSchema,
    async (args) => {
      const run = (): Promise<Result<SearchIssuesResult, AppError>> =>
        searchIssuesHandler(client, args);
      const r =
        cache === null
          ? await run()
          : await withCache(
              cache,
              buildCacheKey({
                endpoint: 'GET /search/issues',
                owner: args.owner,
                repo: args.repo,
                params: { query: args.query, state: args.state, limit: args.limit },
              }),
              TTL_SEARCH_ISSUES_MS,
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
