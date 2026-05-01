import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import type { RepoCoords } from '../../github/schemas.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { type Result, ok, tryCatch } from '../../lib/result.ts';

export const RECENT_ACTIVITY_URI = 'repo://recent-activity';
const ACTIVITY_LIMIT = 10;

export interface ActivityCommit {
  readonly sha: string;
  readonly message: string;
  readonly author: string | null;
  readonly date: string | null;
}

export interface ActivityIssue {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly updatedAt: string;
  readonly htmlUrl: string;
  readonly isPullRequest: boolean;
}

export interface RecentActivity {
  readonly commits: ReadonlyArray<ActivityCommit>;
  readonly openIssues: ReadonlyArray<ActivityIssue>;
  readonly openPullRequests: ReadonlyArray<ActivityIssue>;
}

export async function readRecentActivity(
  client: GitHubClient,
  repo: RepoCoords,
): Promise<Result<RecentActivity, AppError>> {
  const commitsEndpoint = `GET /repos/${repo.owner}/${repo.repo}/commits`;
  const issuesEndpoint = `GET /repos/${repo.owner}/${repo.repo}/issues`;
  const prsEndpoint = `GET /repos/${repo.owner}/${repo.repo}/pulls`;

  const [cR, iR, pR] = await Promise.all([
    tryCatch(
      () =>
        client.rest.repos.listCommits({
          owner: repo.owner,
          repo: repo.repo,
          per_page: ACTIVITY_LIMIT,
        }),
      (e) => mapGitHubError(e, commitsEndpoint),
    ),
    tryCatch(
      () =>
        client.rest.issues.listForRepo({
          owner: repo.owner,
          repo: repo.repo,
          state: 'open',
          per_page: ACTIVITY_LIMIT,
          sort: 'updated',
          direction: 'desc',
        }),
      (e) => mapGitHubError(e, issuesEndpoint),
    ),
    tryCatch(
      () =>
        client.rest.pulls.list({
          owner: repo.owner,
          repo: repo.repo,
          state: 'open',
          per_page: ACTIVITY_LIMIT,
          sort: 'updated',
          direction: 'desc',
        }),
      (e) => mapGitHubError(e, prsEndpoint),
    ),
  ]);
  if (!cR.ok) return cR;
  if (!iR.ok) return iR;
  if (!pR.ok) return pR;

  return ok({
    commits: cR.value.data.map((c) => ({
      sha: c.sha,
      message: c.commit.message.split('\n')[0] ?? '',
      author: c.commit.author?.name ?? null,
      date: c.commit.author?.date ?? null,
    })),
    openIssues: iR.value.data
      .filter((i) => i.pull_request === undefined)
      .map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        updatedAt: i.updated_at,
        htmlUrl: i.html_url,
        isPullRequest: false,
      })),
    openPullRequests: pR.value.data.map((p) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      updatedAt: p.updated_at,
      htmlUrl: p.html_url,
      isPullRequest: true,
    })),
  });
}

export function registerRecentActivityResource(
  server: McpServer,
  client: GitHubClient,
  repo: RepoCoords,
): void {
  server.resource(
    'recent-activity',
    RECENT_ACTIVITY_URI,
    {
      description: `Recent commits + open issues + open PRs for ${repo.owner}/${repo.repo}`,
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      const r = await readRecentActivity(client, repo);
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
