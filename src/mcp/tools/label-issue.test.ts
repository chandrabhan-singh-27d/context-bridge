import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { labelIssueHandler } from './label-issue.ts';

function fakeClient(
  impl: (args: {
    owner: string;
    repo: string;
    issue_number: number;
    labels: ReadonlyArray<string>;
  }) => Promise<{ data: ReadonlyArray<{ name: string }> }>,
): GitHubClient {
  return { rest: { issues: { addLabels: impl } } } as unknown as GitHubClient;
}

describe('labelIssueHandler', () => {
  test('returns applied label names on success', async () => {
    let received: ReadonlyArray<string> = [];
    const client = fakeClient(async (args) => {
      received = args.labels;
      return { data: args.labels.map((n) => ({ name: n })) };
    });
    const r = await labelIssueHandler(client, {
      owner: 'o',
      repo: 'r',
      number: 1,
      labels: ['bug', 'triage'],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.applied).toEqual(['bug', 'triage']);
    expect(received).toEqual(['bug', 'triage']);
  });

  test('maps 422 to GITHUB_API_ERROR', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('unprocessable'), { status: 422 });
    });
    const r = await labelIssueHandler(client, {
      owner: 'o',
      repo: 'r',
      number: 1,
      labels: ['x'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.type === 'GITHUB_API_ERROR') expect(r.error.status).toBe(422);
  });
});
