import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { repoCoordsSchema } from '../../github/schemas.ts';
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

export function registerSearchIssues(server: McpServer, client: GitHubClient): void {
  server.tool(
    'search_issues',
    'Search issues in a GitHub repository by free-text query. Filters: state (open/closed/all), limit (1-100, default 30). Read-only.',
    searchIssuesInputSchema,
    async (args) => {
      const r = await searchIssuesHandler(client, args);
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
