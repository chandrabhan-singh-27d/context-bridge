import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildCacheKey } from '../../cache/cache-key.ts';
import { TTL_REPO_INFO_MS } from '../../cache/ttl.ts';
import { withCache } from '../../cache/with-cache.ts';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { type RepoCoords, repoCoordsSchema } from '../../github/schemas.ts';
import type { TieredCache } from '../../lib/cache/tiered-cache.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { type Result, ok, tryCatch } from '../../lib/result.ts';

export const getRepoInfoInputSchema = repoCoordsSchema;
export type GetRepoInfoInput = RepoCoords;

export interface RepoInfo {
  readonly fullName: string;
  readonly description: string | null;
  readonly defaultBranch: string;
  readonly isPrivate: boolean;
  readonly isArchived: boolean;
  readonly stars: number;
  readonly forks: number;
  readonly openIssues: number;
  readonly language: string | null;
  readonly htmlUrl: string;
  readonly pushedAt: string | null;
  readonly updatedAt: string | null;
}

export async function getRepoInfoHandler(
  client: GitHubClient,
  input: GetRepoInfoInput,
): Promise<Result<RepoInfo, AppError>> {
  const endpoint = `GET /repos/${input.owner}/${input.repo}`;
  const r = await tryCatch(
    () => client.rest.repos.get({ owner: input.owner, repo: input.repo }),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!r.ok) return r;
  const d = r.value.data;
  return ok({
    fullName: d.full_name,
    description: d.description,
    defaultBranch: d.default_branch,
    isPrivate: d.private,
    isArchived: d.archived,
    stars: d.stargazers_count,
    forks: d.forks_count,
    openIssues: d.open_issues_count,
    language: d.language,
    htmlUrl: d.html_url,
    pushedAt: d.pushed_at,
    updatedAt: d.updated_at,
  });
}

export function registerGetRepoInfo(
  server: McpServer,
  client: GitHubClient,
  cache: TieredCache | null,
): void {
  server.tool(
    'get_repo_info',
    'Fetch metadata for a GitHub repository (description, default branch, stars, language, archived flag, etc.). Read-only.',
    getRepoInfoInputSchema,
    async (args) => {
      const run = (): Promise<Result<RepoInfo, AppError>> => getRepoInfoHandler(client, args);
      const r =
        cache === null
          ? await run()
          : await withCache(
              cache,
              buildCacheKey({
                endpoint: 'GET /repos/{owner}/{repo}',
                owner: args.owner,
                repo: args.repo,
              }),
              TTL_REPO_INFO_MS,
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
