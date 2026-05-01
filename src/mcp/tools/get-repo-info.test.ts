import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { getRepoInfoHandler } from './get-repo-info.ts';

type FakeRepo = Partial<{
  full_name: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  archived: boolean;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  html_url: string;
  pushed_at: string | null;
  updated_at: string | null;
}>;

function fakeClient(
  impl: (args: { owner: string; repo: string }) => Promise<{ data: FakeRepo }>,
): GitHubClient {
  return {
    rest: { repos: { get: impl } },
  } as unknown as GitHubClient;
}

describe('getRepoInfoHandler', () => {
  test('maps GitHub repo response to RepoInfo on success', async () => {
    const client = fakeClient(async ({ owner, repo }) => ({
      data: {
        full_name: `${owner}/${repo}`,
        description: 'demo',
        default_branch: 'main',
        private: false,
        archived: false,
        stargazers_count: 42,
        forks_count: 3,
        open_issues_count: 1,
        language: 'TypeScript',
        html_url: `https://github.com/${owner}/${repo}`,
        pushed_at: '2026-04-30T00:00:00Z',
        updated_at: '2026-04-30T00:00:00Z',
      },
    }));

    const result = await getRepoInfoHandler(client, { owner: 'octocat', repo: 'hello' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fullName).toBe('octocat/hello');
    expect(result.value.stars).toBe(42);
    expect(result.value.language).toBe('TypeScript');
  });

  test('maps 404 to NOT_FOUND', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    });
    const r = await getRepoInfoHandler(client, { owner: 'x', repo: 'missing' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('NOT_FOUND');
  });

  test('maps 401 to AUTH_ERROR/invalid_token', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Bad credentials'), { status: 401 });
    });
    const r = await getRepoInfoHandler(client, { owner: 'x', repo: 'y' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('AUTH_ERROR');
    if (r.error.type !== 'AUTH_ERROR') return;
    expect(r.error.reason).toBe('invalid_token');
  });

  test('maps 5xx to GITHUB_API_ERROR', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('boom'), { status: 502 });
    });
    const r = await getRepoInfoHandler(client, { owner: 'x', repo: 'y' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('GITHUB_API_ERROR');
    if (r.error.type !== 'GITHUB_API_ERROR') return;
    expect(r.error.status).toBe(502);
  });
});
