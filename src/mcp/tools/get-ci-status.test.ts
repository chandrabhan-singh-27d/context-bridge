import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { getCiStatusHandler } from './get-ci-status.ts';

interface FakeRun {
  id: number;
  name: string | null;
  workflow_id: number;
  head_branch: string | null;
  head_sha: string;
  event: string;
  status: string | null;
  conclusion: string | null;
  run_number: number;
  html_url: string;
  created_at: string;
  updated_at: string;
}

interface FakeListResponse {
  data: { total_count: number; workflow_runs: FakeRun[] };
}

interface ListParams {
  owner: string;
  repo: string;
  per_page: number;
  branch?: string;
}

function fakeClient(impl: (params: ListParams) => Promise<FakeListResponse>): GitHubClient {
  return { rest: { actions: { listWorkflowRunsForRepo: impl } } } as unknown as GitHubClient;
}

const baseRun: FakeRun = {
  id: 100,
  name: 'CI',
  workflow_id: 1,
  head_branch: 'main',
  head_sha: 'deadbeef',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  run_number: 42,
  html_url: 'https://github.com/x/y/actions/runs/100',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:05:00Z',
};

describe('getCiStatusHandler', () => {
  test('maps workflow runs', async () => {
    const client = fakeClient(async () => ({
      data: { total_count: 1, workflow_runs: [baseRun] },
    }));
    const r = await getCiStatusHandler(client, {
      owner: 'x',
      repo: 'y',
      branch: undefined,
      limit: 10,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.totalCount).toBe(1);
    expect(r.value.runs[0]?.conclusion).toBe('success');
    expect(r.value.runs[0]?.runNumber).toBe(42);
  });

  test('passes branch through as branch param', async () => {
    let capturedBranch: unknown;
    const client = fakeClient(async (params) => {
      capturedBranch = params.branch;
      return { data: { total_count: 0, workflow_runs: [] } };
    });
    const r = await getCiStatusHandler(client, {
      owner: 'x',
      repo: 'y',
      branch: 'feat/x',
      limit: 5,
    });
    expect(r.ok).toBe(true);
    expect(capturedBranch).toBe('feat/x');
  });

  test('omits branch param when branch undefined', async () => {
    let captured: ListParams | null = null;
    const client = fakeClient(async (params) => {
      captured = params;
      return { data: { total_count: 0, workflow_runs: [] } };
    });
    await getCiStatusHandler(client, { owner: 'x', repo: 'y', branch: undefined, limit: 5 });
    expect(captured !== null && 'branch' in captured).toBe(false);
  });

  test('maps 403 insufficient_scope to AUTH_ERROR', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Resource not accessible'), {
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': '4999' } },
      });
    });
    const r = await getCiStatusHandler(client, {
      owner: 'x',
      repo: 'y',
      branch: undefined,
      limit: 10,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('AUTH_ERROR');
  });
});
