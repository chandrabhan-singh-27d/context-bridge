import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { listReviewCommentsHandler } from './list-review-comments.ts';

interface FakeComment {
  id: number;
  user: { login: string } | null;
  body: string;
  path: string;
  line: number | null;
  side?: string;
  commit_id: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  in_reply_to_id?: number;
}

function fakeClient(
  impl: (args: {
    owner: string;
    repo: string;
    pull_number: number;
    per_page: number;
  }) => Promise<{ data: FakeComment[] }>,
): GitHubClient {
  return { rest: { pulls: { listReviewComments: impl } } } as unknown as GitHubClient;
}

const c1: FakeComment = {
  id: 1,
  user: { login: 'alice' },
  body: 'nit: rename',
  path: 'src/x.ts',
  line: 42,
  side: 'RIGHT',
  commit_id: 'abc123',
  html_url: 'https://github.com/x/y/pull/1#discussion_r1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('listReviewCommentsHandler', () => {
  test('maps comments and forwards limit as per_page', async () => {
    let perPage = 0;
    const client = fakeClient(async ({ per_page }) => {
      perPage = per_page;
      return { data: [c1] };
    });
    const r = await listReviewCommentsHandler(client, {
      owner: 'x',
      repo: 'y',
      number: 1,
      limit: 50,
    });
    expect(perPage).toBe(50);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(1);
    expect(r.value[0]?.author).toBe('alice');
    expect(r.value[0]?.line).toBe(42);
    expect(r.value[0]?.side).toBe('RIGHT');
    expect(r.value[0]?.inReplyToId).toBe(null);
  });

  test('preserves reply linkage', async () => {
    const reply: FakeComment = { ...c1, id: 2, in_reply_to_id: 1 };
    const client = fakeClient(async () => ({ data: [reply] }));
    const r = await listReviewCommentsHandler(client, {
      owner: 'x',
      repo: 'y',
      number: 1,
      limit: 30,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.inReplyToId).toBe(1);
  });

  test('handles missing side as null', async () => {
    const { side: _omit, ...noSide } = c1;
    const client = fakeClient(async () => ({ data: [noSide] }));
    const r = await listReviewCommentsHandler(client, {
      owner: 'x',
      repo: 'y',
      number: 1,
      limit: 30,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.side).toBe(null);
  });

  test('maps 404 to NOT_FOUND', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    });
    const r = await listReviewCommentsHandler(client, {
      owner: 'x',
      repo: 'y',
      number: 999,
      limit: 30,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('NOT_FOUND');
  });
});
