import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { commitFilesHandler } from './commit-files.ts';

interface FakeOps {
  defaultBranch?: string;
  branchSha?: string;
  baseTreeSha?: string;
  blobSha?: (path: string) => string;
  treeSha?: string;
  commitSha?: string;
  reposGetThrows?: unknown;
}

function fakeClient(ops: FakeOps): GitHubClient {
  return {
    rest: {
      repos: {
        get: async () => {
          if (ops.reposGetThrows !== undefined) throw ops.reposGetThrows;
          return { data: { default_branch: ops.defaultBranch ?? 'main' } };
        },
      },
      git: {
        getRef: async () => ({ data: { object: { sha: ops.branchSha ?? 'parent' } } }),
        getCommit: async () => ({ data: { tree: { sha: ops.baseTreeSha ?? 'tree-base' } } }),
        createBlob: async ({ content }: { content: string }) => ({
          data: { sha: (ops.blobSha ?? (() => `blob-${content.length}`))(content) },
        }),
        createTree: async () => ({ data: { sha: ops.treeSha ?? 'tree-new' } }),
        createCommit: async () => ({
          data: {
            sha: ops.commitSha ?? 'commit-new',
            html_url: `https://github.com/o/r/commit/${ops.commitSha ?? 'commit-new'}`,
          },
        }),
        updateRef: async () => ({ data: {} }),
      },
    },
  } as unknown as GitHubClient;
}

describe('commitFilesHandler', () => {
  test('happy path returns commitSha + url', async () => {
    const client = fakeClient({});
    const r = await commitFilesHandler(client, {
      owner: 'o',
      repo: 'r',
      branch: 'feat',
      message: 'add files',
      files: [
        { path: 'a.ts', content: 'export const a = 1;' },
        { path: 'b.ts', content: 'export const b = 2;' },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.commitSha).toBe('commit-new');
  });

  test('rejects commit to default branch', async () => {
    const client = fakeClient({ defaultBranch: 'main' });
    const r = await commitFilesHandler(client, {
      owner: 'o',
      repo: 'r',
      branch: 'main',
      message: 'm',
      files: [{ path: 'x.ts', content: 'x' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('VALIDATION_ERROR');
  });

  test('propagates upstream 404 from repo lookup', async () => {
    const client = fakeClient({ reposGetThrows: Object.assign(new Error('nf'), { status: 404 }) });
    const r = await commitFilesHandler(client, {
      owner: 'o',
      repo: 'r',
      branch: 'feat',
      message: 'm',
      files: [{ path: 'x.ts', content: 'x' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('NOT_FOUND');
  });
});
