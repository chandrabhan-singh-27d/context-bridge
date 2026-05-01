import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { readStructure } from './structure.ts';

interface FakeRepo {
  default_branch: string;
}

interface FakeTreeEntry {
  path?: string;
  type?: string;
  size?: number;
}

interface FakeTree {
  truncated: boolean;
  tree: FakeTreeEntry[];
}

function fakeClient(opts: {
  repo?: () => Promise<{ data: FakeRepo }>;
  tree?: () => Promise<{ data: FakeTree }>;
}): GitHubClient {
  return {
    rest: {
      repos: { get: opts.repo ?? (async () => ({ data: { default_branch: 'main' } })) },
      git: {
        getTree: opts.tree ?? (async () => ({ data: { truncated: false, tree: [] } })),
      },
    },
  } as unknown as GitHubClient;
}

describe('readStructure', () => {
  test('returns default branch + filtered tree', async () => {
    const client = fakeClient({
      tree: async () => ({
        data: {
          truncated: false,
          tree: [
            { path: 'src', type: 'tree' },
            { path: 'src/index.ts', type: 'blob', size: 100 },
            { path: 'commit-link', type: 'commit' },
          ],
        },
      }),
    });
    const r = await readStructure(client, { owner: 'x', repo: 'y' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.defaultBranch).toBe('main');
    expect(r.value.entries.length).toBe(2);
    expect(r.value.entries[1]?.size).toBe(100);
  });

  test('forwards repo lookup failure', async () => {
    const client = fakeClient({
      repo: async () => {
        throw Object.assign(new Error('Not Found'), { status: 404 });
      },
    });
    const r = await readStructure(client, { owner: 'x', repo: 'nope' });
    expect(r.ok).toBe(false);
  });

  test('preserves truncated flag', async () => {
    const client = fakeClient({
      tree: async () => ({ data: { truncated: true, tree: [] } }),
    });
    const r = await readStructure(client, { owner: 'x', repo: 'y' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(true);
  });
});
