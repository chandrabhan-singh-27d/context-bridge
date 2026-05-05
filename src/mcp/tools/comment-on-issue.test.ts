import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { commentOnIssueHandler } from './comment-on-issue.ts';

function fakeClient(
  impl: (args: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }) => Promise<{ data: { id: number; html_url: string } }>,
): GitHubClient {
  return { rest: { issues: { createComment: impl } } } as unknown as GitHubClient;
}

describe('commentOnIssueHandler', () => {
  test('returns Ok with id+url on success', async () => {
    let captured: { issue_number?: number; body?: string } = {};
    const client = fakeClient(async (args) => {
      captured = { issue_number: args.issue_number, body: args.body };
      return { data: { id: 123, html_url: 'https://github.com/o/r/issues/4#issuecomment-123' } };
    });
    const r = await commentOnIssueHandler(client, {
      owner: 'o',
      repo: 'r',
      number: 4,
      body: 'hi',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe(123);
      expect(r.value.htmlUrl).toContain('#issuecomment-123');
    }
    expect(captured.issue_number).toBe(4);
    expect(captured.body).toBe('hi');
  });

  test('maps 404 to NOT_FOUND', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('not found'), { status: 404 });
    });
    const r = await commentOnIssueHandler(client, { owner: 'o', repo: 'r', number: 1, body: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('NOT_FOUND');
  });

  test('maps 403 with insufficient_scope', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('forbidden'), {
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': '5000' } },
      });
    });
    const r = await commentOnIssueHandler(client, { owner: 'o', repo: 'r', number: 1, body: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.type === 'AUTH_ERROR') {
      expect(r.error.reason).toBe('insufficient_scope');
    }
  });
});
