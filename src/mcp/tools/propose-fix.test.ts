import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { ok } from '../../lib/result.ts';
import type { ChatRequest, LlmProvider } from '../../llm/provider.ts';
import { proposeFixHandler } from './propose-fix.ts';

interface FakeOps {
  issue?: { title?: string; body?: string | null; user?: { login: string } };
  comments?: ReadonlyArray<{ user?: { login: string }; body?: string }>;
  defaultBranch?: string;
  branchSha?: string;
  fileContent?: Record<string, string>;
  fileType?: 'file' | 'dir';
  refSha?: string;
  commitSha?: string;
  prNumber?: number;
  capturedPrBody?: { value: string };
}

function fakeClient(ops: FakeOps): GitHubClient {
  return {
    rest: {
      issues: {
        get: async () => ({
          data: {
            title: ops.issue?.title ?? 'fix typo',
            body: ops.issue?.body ?? 'README has a typo',
            state: 'open',
            labels: [],
            user: ops.issue?.user ?? { login: 'reporter' },
          },
        }),
        listComments: async () => ({ data: ops.comments ?? [] }),
      },
      repos: {
        get: async () => ({ data: { default_branch: ops.defaultBranch ?? 'main' } }),
        getContent: async ({ path }: { path: string }) => ({
          data: {
            type: ops.fileType ?? 'file',
            content: Buffer.from(ops.fileContent?.[path] ?? '').toString('base64'),
          },
        }),
      },
      git: {
        getRef: async () => ({ data: { object: { sha: ops.refSha ?? 'parent-sha' } } }),
        createRef: async ({ ref, sha }: { ref: string; sha: string }) => ({
          data: { ref, object: { sha } },
        }),
        getCommit: async () => ({ data: { tree: { sha: 'tree-sha' } } }),
        createBlob: async () => ({ data: { sha: 'blob-sha' } }),
        createTree: async () => ({ data: { sha: 'new-tree' } }),
        createCommit: async () => ({
          data: {
            sha: ops.commitSha ?? 'commit-sha',
            html_url: 'https://github.com/o/r/commit/commit-sha',
          },
        }),
        updateRef: async () => ({ data: {} }),
      },
      pulls: {
        create: async (args: { body: string; draft?: boolean }) => {
          if (ops.capturedPrBody) ops.capturedPrBody.value = args.body;
          return {
            data: {
              number: ops.prNumber ?? 99,
              html_url: `https://github.com/o/r/pull/${ops.prNumber ?? 99}`,
              draft: args.draft ?? false,
            },
          };
        },
      },
    },
  } as unknown as GitHubClient;
}

function fakeLlm(content: string, model = 'fake-m'): LlmProvider {
  return {
    name: 'fake',
    model,
    chat: async (_req: ChatRequest) => ok({ content, model }),
  };
}

const goodProposal = JSON.stringify({
  branchName: 'fix/issue-7-typo',
  commitMessage: 'fix: README typo',
  files: [{ path: 'README.md', content: '# Project\nIntroduction\n' }],
  prTitle: 'fix README typo',
  prBody: '## Summary\nFix typo.\n\n## Notes\nNone.',
});

describe('proposeFixHandler', () => {
  test('happy path: opens draft PR with branch + commit + closes marker', async () => {
    const captured = { value: '' };
    const client = fakeClient({ prNumber: 7, capturedPrBody: captured });
    const llm = fakeLlm(goodProposal);
    const result = await proposeFixHandler(client, llm, { owner: 'o', repo: 'r', number: 7 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prNumber).toBe(7);
      expect(result.value.branchName).toBe('fix/issue-7-typo');
    }
    expect(captured.value).toContain('Closes #7');
  });

  test('preserves existing Closes marker without duplicating', async () => {
    const captured = { value: '' };
    const proposalWithMarker = JSON.stringify({
      branchName: 'fix/x',
      commitMessage: 'fix: x',
      files: [{ path: 'a.md', content: 'x' }],
      prTitle: 't',
      prBody: '## Summary\nFixes it.\n\nCloses #11\n',
    });
    const client = fakeClient({ prNumber: 11, capturedPrBody: captured });
    const llm = fakeLlm(proposalWithMarker);
    const result = await proposeFixHandler(client, llm, { owner: 'o', repo: 'r', number: 11 });
    expect(result.ok).toBe(true);
    const occurrences = captured.value.match(/Closes #11/g)?.length ?? 0;
    expect(occurrences).toBe(1);
  });

  test('refuses empty files array', async () => {
    const empty = JSON.stringify({
      branchName: 'fix/x',
      commitMessage: 'm',
      files: [],
      prTitle: 't',
      prBody: 'cannot fix without seeing the code',
    });
    const client = fakeClient({});
    const llm = fakeLlm(empty);
    const result = await proposeFixHandler(client, llm, { owner: 'o', repo: 'r', number: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('INTERNAL_ERROR');
      expect(result.error.message).toContain('empty files array');
    }
  });

  test('rejects bad branchName from LLM at schema layer', async () => {
    const bad = JSON.stringify({
      branchName: 'bad branch with spaces',
      commitMessage: 'm',
      files: [{ path: 'a', content: 'x' }],
      prTitle: 't',
      prBody: 'b',
    });
    const client = fakeClient({});
    const llm = fakeLlm(bad);
    const result = await proposeFixHandler(client, llm, { owner: 'o', repo: 'r', number: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('INTERNAL_ERROR');
      expect(result.error.message).toContain('schema validation');
    }
  });

  test('threads relevantPaths through to file fetch', async () => {
    const client = fakeClient({
      fileContent: { 'README.md': '# Project\nIntroducton...' },
      capturedPrBody: { value: '' },
    });
    const llm = fakeLlm(goodProposal);
    const result = await proposeFixHandler(client, llm, {
      owner: 'o',
      repo: 'r',
      number: 7,
      relevantPaths: ['README.md'],
    });
    expect(result.ok).toBe(true);
  });
});
