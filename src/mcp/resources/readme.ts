import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import type { RepoCoords } from '../../github/schemas.ts';
import type { AppError } from '../../lib/errors.ts';
import { AppError as AppErr, formatAppError } from '../../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../../lib/result.ts';

export const README_URI = 'repo://readme';

export async function readReadme(
  client: GitHubClient,
  repo: RepoCoords,
): Promise<Result<string, AppError>> {
  const endpoint = `GET /repos/${repo.owner}/${repo.repo}/readme`;
  const r = await tryCatch(
    () => client.rest.repos.getReadme({ owner: repo.owner, repo: repo.repo }),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!r.ok) return r;
  const d = r.value.data;
  if (d.encoding !== 'base64') {
    return err(
      AppErr.internal(`unexpected readme encoding from github: "${d.encoding}" (expected base64)`),
    );
  }
  const decoded = Buffer.from(d.content, 'base64').toString('utf8');
  return ok(decoded);
}

export function registerReadmeResource(
  server: McpServer,
  client: GitHubClient,
  repo: RepoCoords,
): void {
  server.resource(
    'readme',
    README_URI,
    { description: `README of ${repo.owner}/${repo.repo}`, mimeType: 'text/markdown' },
    async (uri): Promise<ReadResourceResult> => {
      const r = await readReadme(client, repo);
      if (!r.ok) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: formatAppError(r.error),
            },
          ],
        };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: r.value,
          },
        ],
      };
    },
  );
}
