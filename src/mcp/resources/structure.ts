import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import type { RepoCoords } from '../../github/schemas.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { type Result, ok, tryCatch } from '../../lib/result.ts';

export const STRUCTURE_URI = 'repo://structure';

export interface TreeEntry {
  readonly path: string;
  readonly type: 'blob' | 'tree';
  readonly size: number | null;
}

export interface RepoStructure {
  readonly defaultBranch: string;
  readonly truncated: boolean;
  readonly entries: ReadonlyArray<TreeEntry>;
}

export async function readStructure(
  client: GitHubClient,
  repo: RepoCoords,
): Promise<Result<RepoStructure, AppError>> {
  const repoEndpoint = `GET /repos/${repo.owner}/${repo.repo}`;
  const repoR = await tryCatch(
    () => client.rest.repos.get({ owner: repo.owner, repo: repo.repo }),
    (e) => mapGitHubError(e, repoEndpoint),
  );
  if (!repoR.ok) return repoR;
  const defaultBranch = repoR.value.data.default_branch;

  const treeEndpoint = `GET /repos/${repo.owner}/${repo.repo}/git/trees/${defaultBranch}`;
  const treeR = await tryCatch(
    () =>
      client.rest.git.getTree({
        owner: repo.owner,
        repo: repo.repo,
        tree_sha: defaultBranch,
        recursive: '1',
      }),
    (e) => mapGitHubError(e, treeEndpoint),
  );
  if (!treeR.ok) return treeR;
  const t = treeR.value.data;
  return ok({
    defaultBranch,
    truncated: t.truncated,
    entries: t.tree
      .filter((e) => e.type === 'blob' || e.type === 'tree')
      .map((e) => ({
        path: e.path ?? '',
        type: e.type as 'blob' | 'tree',
        size: e.size ?? null,
      })),
  });
}

export function registerStructureResource(
  server: McpServer,
  client: GitHubClient,
  repo: RepoCoords,
): void {
  server.resource(
    'structure',
    STRUCTURE_URI,
    {
      description: `Recursive file tree for ${repo.owner}/${repo.repo} default branch`,
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      const r = await readStructure(client, repo);
      if (!r.ok) {
        return {
          contents: [{ uri: uri.href, mimeType: 'text/plain', text: formatAppError(r.error) }],
        };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(r.value, null, 2),
          },
        ],
      };
    },
  );
}
