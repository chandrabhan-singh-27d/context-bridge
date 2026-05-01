import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { searchIssuesHandler } from './search-issues.ts';

interface FakeItem {
  number: number;
  title: string;
  state: string;
  user: { login: string } | null;
  labels: Array<string | { name: string }>;
  comments: number;
  html_url: string;
  created_at: string;
  updated_at: string;
  pull_request?: { url: string };
}

function fakeClient(
  impl: (args: { q: string; per_page: number }) => Promise<{
    data: { total_count: number; incomplete_results: boolean; items: FakeItem[] };
  }>,
): GitHubClient {
  return {
    rest: { search: { issuesAndPullRequests: impl } },
  } as unknown as GitHubClient;
}

const baseItem: FakeItem = {
  number: 1,
  title: 'bug',
  state: 'open',
  user: { login: 'octocat' },
  labels: [{ name: 'bug' }, 'help-wanted'],
  comments: 2,
  html_url: 'https://github.com/x/y/issues/1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

describe('searchIssuesHandler', () => {
  test('builds query from repo + state + free text', async () => {
    let captured = '';
    const client = fakeClient(async ({ q }) => {
      captured = q;
      return { data: { total_count: 0, incomplete_results: false, items: [] } };
    });
    await searchIssuesHandler(client, {
      owner: 'octocat',
      repo: 'hello',
      query: 'memory leak',
      state: 'open',
      limit: 30,
    });
    expect(captured).toBe('repo:octocat/hello is:issue is:open memory leak');
  });

  test('omits state qualifier when state=all', async () => {
    let captured = '';
    const client = fakeClient(async ({ q }) => {
      captured = q;
      return { data: { total_count: 0, incomplete_results: false, items: [] } };
    });
    await searchIssuesHandler(client, {
      owner: 'a',
      repo: 'b',
      query: 'foo',
      state: 'all',
      limit: 10,
    });
    expect(captured).toBe('repo:a/b is:issue foo');
  });

  test('maps response to IssueSummary, handles string + object labels', async () => {
    const client = fakeClient(async () => ({
      data: { total_count: 1, incomplete_results: false, items: [baseItem] },
    }));
    const r = await searchIssuesHandler(client, {
      owner: 'x',
      repo: 'y',
      query: 'q',
      state: 'open',
      limit: 30,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.totalCount).toBe(1);
    expect(r.value.items[0]?.number).toBe(1);
    expect(r.value.items[0]?.author).toBe('octocat');
    expect(r.value.items[0]?.labels).toEqual(['bug', 'help-wanted']);
    expect(r.value.items[0]?.isPullRequest).toBe(false);
  });

  test('flags pull requests in mixed search results', async () => {
    const pr: FakeItem = { ...baseItem, number: 2, pull_request: { url: 'x' } };
    const client = fakeClient(async () => ({
      data: { total_count: 1, incomplete_results: false, items: [pr] },
    }));
    const r = await searchIssuesHandler(client, {
      owner: 'x',
      repo: 'y',
      query: 'q',
      state: 'open',
      limit: 30,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items[0]?.isPullRequest).toBe(true);
  });

  test('passes through limit as per_page', async () => {
    let perPage = 0;
    const client = fakeClient(async ({ per_page }) => {
      perPage = per_page;
      return { data: { total_count: 0, incomplete_results: false, items: [] } };
    });
    await searchIssuesHandler(client, {
      owner: 'x',
      repo: 'y',
      query: 'q',
      state: 'open',
      limit: 75,
    });
    expect(perPage).toBe(75);
  });

  test('maps 422 (invalid query) to GITHUB_API_ERROR', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Validation Failed'), { status: 422 });
    });
    const r = await searchIssuesHandler(client, {
      owner: 'x',
      repo: 'y',
      query: 'bad:syntax',
      state: 'open',
      limit: 30,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('GITHUB_API_ERROR');
    if (r.error.type !== 'GITHUB_API_ERROR') return;
    expect(r.error.status).toBe(422);
  });
});
