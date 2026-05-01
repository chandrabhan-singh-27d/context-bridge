import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { getPullRequestHandler } from './get-pull-request.ts';

interface FakePR {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft?: boolean;
  merged: boolean;
  mergeable: boolean | null;
  user: { login: string } | null;
  base: { ref: string };
  head: { ref: string; sha: string };
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  comments: number;
  review_comments: number;
  labels: Array<{ name: string }>;
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

function fakeClient(impl: () => Promise<{ data: FakePR }>): GitHubClient {
  return { rest: { pulls: { get: impl } } } as unknown as GitHubClient;
}

const basePR: FakePR = {
  number: 42,
  title: 'fix: bug',
  body: 'closes #1',
  state: 'open',
  draft: false,
  merged: false,
  mergeable: true,
  user: { login: 'octocat' },
  base: { ref: 'main' },
  head: { ref: 'feat/x', sha: 'abc1234' },
  additions: 100,
  deletions: 20,
  changed_files: 5,
  commits: 3,
  comments: 1,
  review_comments: 4,
  labels: [{ name: 'bug' }, { name: 'p1' }],
  html_url: 'https://github.com/x/y/pull/42',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  merged_at: null,
  closed_at: null,
};

describe('getPullRequestHandler', () => {
  test('maps PR response to PullRequestSummary on success', async () => {
    const client = fakeClient(async () => ({ data: basePR }));
    const r = await getPullRequestHandler(client, { owner: 'x', repo: 'y', number: 42 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.number).toBe(42);
    expect(r.value.headSha).toBe('abc1234');
    expect(r.value.labels).toEqual(['bug', 'p1']);
    expect(r.value.merged).toBe(false);
  });

  test('preserves merged/closed state', async () => {
    const merged: FakePR = {
      ...basePR,
      state: 'closed',
      merged: true,
      merged_at: '2026-01-03T00:00:00Z',
      closed_at: '2026-01-03T00:00:00Z',
    };
    const client = fakeClient(async () => ({ data: merged }));
    const r = await getPullRequestHandler(client, { owner: 'x', repo: 'y', number: 42 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.merged).toBe(true);
    expect(r.value.mergedAt).toBe('2026-01-03T00:00:00Z');
  });

  test('defaults draft to false when undefined', async () => {
    const { draft: _omit, ...noDraft } = basePR;
    const client = fakeClient(async () => ({ data: noDraft as typeof basePR }));
    const r = await getPullRequestHandler(client, { owner: 'x', repo: 'y', number: 42 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.draft).toBe(false);
  });

  test('maps 404 to NOT_FOUND', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    });
    const r = await getPullRequestHandler(client, { owner: 'x', repo: 'y', number: 999 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('NOT_FOUND');
  });
});
