import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { createBranchHandler } from './create-branch.ts';

interface FakeOps {
  reposGet?: () => Promise<{ data: { default_branch: string } }>;
  getRef?: (args: { ref: string }) => Promise<{ data: { object: { sha: string } } }>;
  createRef?: (args: {
    ref: string;
    sha: string;
  }) => Promise<{ data: { ref: string; object: { sha: string } } }>;
}

function fakeClient(ops: FakeOps): GitHubClient {
  return {
    rest: {
      repos: { get: ops.reposGet },
      git: { getRef: ops.getRef, createRef: ops.createRef },
    },
  } as unknown as GitHubClient;
}

describe('createBranchHandler', () => {
  test('creates ref from default branch HEAD when fromRef omitted', async () => {
    let createdWith: { ref?: string; sha?: string } = {};
    const client = fakeClient({
      reposGet: async () => ({ data: { default_branch: 'main' } }),
      getRef: async ({ ref }) => {
        expect(ref).toBe('heads/main');
        return { data: { object: { sha: 'abc123' } } };
      },
      createRef: async ({ ref, sha }) => {
        createdWith = { ref, sha };
        return { data: { ref: `refs/heads/feat`, object: { sha } } };
      },
    });
    const r = await createBranchHandler(client, { owner: 'o', repo: 'r', name: 'feat' });
    expect(r.ok).toBe(true);
    expect(createdWith.ref).toBe('refs/heads/feat');
    expect(createdWith.sha).toBe('abc123');
  });

  test('uses fromRef when provided', async () => {
    let resolvedRef = '';
    const client = fakeClient({
      getRef: async ({ ref }) => {
        resolvedRef = ref;
        return { data: { object: { sha: 'def456' } } };
      },
      createRef: async ({ sha }) => ({ data: { ref: 'refs/heads/feat', object: { sha } } }),
    });
    const r = await createBranchHandler(client, {
      owner: 'o',
      repo: 'r',
      name: 'feat',
      fromRef: 'develop',
    });
    expect(r.ok).toBe(true);
    expect(resolvedRef).toBe('heads/develop');
    if (r.ok) expect(r.value.sha).toBe('def456');
  });

  test('rejects when name === fromRef', async () => {
    const client = fakeClient({});
    const r = await createBranchHandler(client, {
      owner: 'o',
      repo: 'r',
      name: 'x',
      fromRef: 'x',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('VALIDATION_ERROR');
  });

  test('maps 422 from createRef to GITHUB_API_ERROR', async () => {
    const client = fakeClient({
      reposGet: async () => ({ data: { default_branch: 'main' } }),
      getRef: async () => ({ data: { object: { sha: 'a' } } }),
      createRef: async () => {
        throw Object.assign(new Error('exists'), { status: 422 });
      },
    });
    const r = await createBranchHandler(client, { owner: 'o', repo: 'r', name: 'feat' });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.type === 'GITHUB_API_ERROR') expect(r.error.status).toBe(422);
  });
});
