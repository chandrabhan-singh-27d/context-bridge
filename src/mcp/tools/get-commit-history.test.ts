import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { getCommitHistoryHandler } from './get-commit-history.ts';

interface FakeCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string } | null;
    committer: { name: string } | null;
  };
  parents: Array<{ sha: string }>;
}

function fakeClient(
  impl: (params: Record<string, unknown>) => Promise<{ data: FakeCommit[] }>,
): GitHubClient {
  return { rest: { repos: { listCommits: impl } } } as unknown as GitHubClient;
}

const baseCommit: FakeCommit = {
  sha: 'abc123',
  html_url: 'https://github.com/x/y/commit/abc123',
  commit: {
    message: 'feat: thing',
    author: { name: 'octocat', email: 'oct@cat.io', date: '2026-01-01T00:00:00Z' },
    committer: { name: 'octocat' },
  },
  parents: [{ sha: 'parent1' }],
};

describe('getCommitHistoryHandler', () => {
  test('maps commits to CommitSummary', async () => {
    const client = fakeClient(async () => ({ data: [baseCommit] }));
    const r = await getCommitHistoryHandler(client, {
      owner: 'x',
      repo: 'y',
      ref: undefined,
      path: undefined,
      author: undefined,
      since: undefined,
      until: undefined,
      limit: 30,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.sha).toBe('abc123');
    expect(r.value[0]?.author).toBe('octocat');
    expect(r.value[0]?.parentShas).toEqual(['parent1']);
  });

  test('passes optional filters through', async () => {
    let captured: {
      sha?: unknown;
      path?: unknown;
      author?: unknown;
      since?: unknown;
      until?: unknown;
    } = {};
    const client = fakeClient(async (params) => {
      captured = params;
      return { data: [] };
    });
    await getCommitHistoryHandler(client, {
      owner: 'x',
      repo: 'y',
      ref: 'main',
      path: 'src/x.ts',
      author: 'octocat',
      since: '2026-01-01T00:00:00Z',
      until: '2026-02-01T00:00:00Z',
      limit: 10,
    });
    expect(captured.sha).toBe('main');
    expect(captured.path).toBe('src/x.ts');
    expect(captured.author).toBe('octocat');
    expect(captured.since).toBe('2026-01-01T00:00:00Z');
    expect(captured.until).toBe('2026-02-01T00:00:00Z');
  });

  test('omits undefined filters', async () => {
    let captured: Record<string, unknown> = {};
    const client = fakeClient(async (params) => {
      captured = params;
      return { data: [] };
    });
    await getCommitHistoryHandler(client, {
      owner: 'x',
      repo: 'y',
      ref: undefined,
      path: undefined,
      author: undefined,
      since: undefined,
      until: undefined,
      limit: 30,
    });
    expect('sha' in captured).toBe(false);
    expect('path' in captured).toBe(false);
    expect('author' in captured).toBe(false);
  });

  test('handles missing author block', async () => {
    const noAuthor: FakeCommit = { ...baseCommit, commit: { ...baseCommit.commit, author: null } };
    const client = fakeClient(async () => ({ data: [noAuthor] }));
    const r = await getCommitHistoryHandler(client, {
      owner: 'x',
      repo: 'y',
      ref: undefined,
      path: undefined,
      author: undefined,
      since: undefined,
      until: undefined,
      limit: 30,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.author).toBeNull();
    expect(r.value[0]?.authorEmail).toBeNull();
    expect(r.value[0]?.authorDate).toBeNull();
  });

  test('maps 404 to NOT_FOUND', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    });
    const r = await getCommitHistoryHandler(client, {
      owner: 'x',
      repo: 'nope',
      ref: undefined,
      path: undefined,
      author: undefined,
      since: undefined,
      until: undefined,
      limit: 30,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('NOT_FOUND');
  });
});
