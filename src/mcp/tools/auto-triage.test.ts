import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { ok } from '../../lib/result.ts';
import type { ChatRequest, LlmProvider } from '../../llm/provider.ts';
import { autoTriageHandler } from './auto-triage.ts';

function fakeLlm(content: string, model = 'at-m'): LlmProvider {
  return {
    name: 'fake',
    model,
    chat: async (_req: ChatRequest) => ok({ content, model }),
  };
}

const findingJson = {
  summary: 'two issues found',
  findings: [
    {
      severity: 'high',
      title: 'outdated deps',
      description: 'project uses outdated dependencies with known vulns',
      category: 'security',
      proposedFix: {
        branchName: 'fix/outdated-deps',
        commitMessage: 'fix: update outdated dependencies',
        files: [{ path: 'README.md', content: '# Updated\nSecurity fixes applied.' }],
        prTitle: 'fix: update outdated deps',
        prBody: '## Summary\nUpdates deps.\n## Review Notes\nHuman review please.',
      },
    },
    {
      severity: 'low',
      title: 'missing ci badge',
      description: 'README lacks CI status badge',
      category: 'enhancement',
      proposedFix: {
        branchName: 'fix/ci-badge',
        commitMessage: 'docs: add CI badge to README',
        files: [{ path: 'README.md', content: '# Repo\n[![CI](https://example.com/ci.svg)](...)' }],
        prTitle: 'docs: add CI badge',
        prBody: '## Summary\nAdds badge.\n## Review Notes\nHuman review please.',
      },
    },
  ],
};

function makeClient(): GitHubClient {
  return {
    rest: {
      issues: {
        listForRepo: async () => ({
          data: [
            {
              number: 1,
              title: 'bug',
              state: 'open',
              labels: [],
              created_at: new Date().toISOString(),
            },
          ],
        }),
        create: async () => ({
          data: { number: 99, html_url: 'https://github.com/o/r/issues/99' },
        }),
      },
      pulls: {
        list: async () => ({
          data: [
            {
              number: 42,
              title: 'fix',
              state: 'open',
              draft: false,
              created_at: new Date().toISOString(),
            },
          ],
        }),
        create: async () => ({
          data: { number: 42, html_url: 'https://github.com/o/r/pull/42', draft: true },
        }),
        createReview: async () => ({ data: {} }),
      },
      actions: {
        listWorkflowRunsForRepo: async () => ({
          data: {
            workflow_runs: [
              {
                name: 'CI',
                conclusion: 'success',
                head_branch: 'main',
                created_at: new Date().toISOString(),
              },
            ],
          },
        }),
      },
      repos: {
        listCommits: async () => ({
          data: [
            {
              sha: 'abc123',
              commit: {
                message: 'initial',
                author: { name: 'alice', date: new Date().toISOString() },
              },
            },
          ],
        }),
        get: async () => ({ data: { default_branch: 'main' } }),
      },
      git: {
        getRef: async () => ({ data: { object: { sha: 'abc123' } } }),
        createRef: async () => ({ data: { ref: 'refs/heads/fix/x', object: { sha: 'def456' } } }),
        getCommit: async () => ({ data: { tree: { sha: 'tree123' } } }),
        createBlob: async () => ({ data: { sha: 'blob123' } }),
        createTree: async () => ({ data: { sha: 'tree456' } }),
        createCommit: async () => ({ data: { sha: 'commit123' } }),
        updateRef: async () => ({ data: {} }),
      },
    },
  } as unknown as GitHubClient;
}

describe('autoTriageHandler', () => {
  test('returns actions with issue + PR for each finding', async () => {
    const llm = fakeLlm(JSON.stringify(findingJson));
    const client = makeClient();
    const result = await autoTriageHandler(client, llm, { owner: 'o', repo: 'r' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toBe('two issues found');
    expect(result.value.actions).toHaveLength(2);
    const a0 = result.value.actions[0];
    expect(a0?.issueNumber).toBe(99);
    expect(a0?.prNumber).toBe(42);
    expect(a0?.prUrl).toBe('https://github.com/o/r/pull/42');
    expect(result.value.llmModel).toBe('at-m');
  });

  test('limits actions to maxFixes', async () => {
    const llm = fakeLlm(JSON.stringify(findingJson));
    const client = makeClient();
    const result = await autoTriageHandler(client, llm, { owner: 'o', repo: 'r', maxFixes: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.actions).toHaveLength(1);
  });

  test('returns INTERNAL_ERROR on non-JSON LLM', async () => {
    const llm = fakeLlm('not json');
    const client = makeClient();
    const result = await autoTriageHandler(client, llm, { owner: 'o', repo: 'r' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('INTERNAL_ERROR');
  });
});
