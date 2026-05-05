import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { commentOnPrHandler } from './comment-on-pr.ts';

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

describe('commentOnPrHandler', () => {
  test('uses issues.createComment under the hood', async () => {
    let endpointArgs: { issue_number?: number } = {};
    const client = fakeClient(async (args) => {
      endpointArgs = { issue_number: args.issue_number };
      return { data: { id: 7, html_url: 'https://github.com/o/r/pull/9#issuecomment-7' } };
    });
    const r = await commentOnPrHandler(client, { owner: 'o', repo: 'r', number: 9, body: 'lgtm' });
    expect(r.ok).toBe(true);
    expect(endpointArgs.issue_number).toBe(9);
  });

  test('maps 404 to NOT_FOUND', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('nope'), { status: 404 });
    });
    const r = await commentOnPrHandler(client, { owner: 'o', repo: 'r', number: 9, body: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('NOT_FOUND');
  });
});
