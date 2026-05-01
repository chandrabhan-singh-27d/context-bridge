import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { readRecentActivity } from './recent-activity.ts';

interface FakeCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
}

interface FakeIssue {
  number: number;
  title: string;
  state: string;
  updated_at: string;
  html_url: string;
  pull_request?: object;
}

interface FakePR {
  number: number;
  title: string;
  state: string;
  updated_at: string;
  html_url: string;
}

function fakeClient(opts: {
  commits?: FakeCommit[];
  issues?: FakeIssue[];
  prs?: FakePR[];
  failOn?: 'commits' | 'issues' | 'prs';
}): GitHubClient {
  return {
    rest: {
      repos: {
        listCommits: async () => {
          if (opts.failOn === 'commits') throw Object.assign(new Error('x'), { status: 500 });
          return { data: opts.commits ?? [] };
        },
      },
      issues: {
        listForRepo: async () => {
          if (opts.failOn === 'issues') throw Object.assign(new Error('x'), { status: 500 });
          return { data: opts.issues ?? [] };
        },
      },
      pulls: {
        list: async () => {
          if (opts.failOn === 'prs') throw Object.assign(new Error('x'), { status: 500 });
          return { data: opts.prs ?? [] };
        },
      },
    },
  } as unknown as GitHubClient;
}

describe('readRecentActivity', () => {
  test('aggregates commits, open issues (PR-filtered), open PRs', async () => {
    const client = fakeClient({
      commits: [
        {
          sha: 'a1',
          commit: {
            message: 'feat: thing\n\nbody',
            author: { name: 'oct', date: '2026-01-01T00:00:00Z' },
          },
        },
      ],
      issues: [
        {
          number: 1,
          title: 'bug',
          state: 'open',
          updated_at: '2026-01-01T00:00:00Z',
          html_url: 'u1',
        },
        {
          number: 2,
          title: 'pr-as-issue',
          state: 'open',
          updated_at: '2026-01-01T00:00:00Z',
          html_url: 'u2',
          pull_request: {},
        },
      ],
      prs: [
        {
          number: 3,
          title: 'fix',
          state: 'open',
          updated_at: '2026-01-01T00:00:00Z',
          html_url: 'u3',
        },
      ],
    });
    const r = await readRecentActivity(client, { owner: 'x', repo: 'y' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.commits[0]?.message).toBe('feat: thing');
    expect(r.value.openIssues.length).toBe(1);
    expect(r.value.openIssues[0]?.number).toBe(1);
    expect(r.value.openPullRequests.length).toBe(1);
  });

  test('returns first failing call result', async () => {
    const client = fakeClient({ failOn: 'issues' });
    const r = await readRecentActivity(client, { owner: 'x', repo: 'y' });
    expect(r.ok).toBe(false);
  });
});
