import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { ok } from '../../lib/result.ts';
import type { ChatRequest, LlmProvider } from '../../llm/provider.ts';
import { scanRepoHandler } from './scan-repo.ts';

function fakeLlm(content: string, model = 'scan-m'): LlmProvider {
  return {
    name: 'fake',
    model,
    chat: async (_req: ChatRequest) => ok({ content, model }),
  };
}

function makeClient(overrides?: {
  issues?: unknown[];
  pullRequests?: unknown[];
  workflowRuns?: unknown[];
  commits?: unknown[];
}): GitHubClient {
  return {
    rest: {
      issues: {
        listForRepo: async () => ({
          data: overrides?.issues ?? [
            {
              number: 1,
              title: 'bug',
              state: 'open',
              labels: [],
              created_at: new Date().toISOString(),
              pull_request: undefined,
            },
          ],
        }),
      },
      pulls: {
        list: async () => ({
          data: overrides?.pullRequests ?? [
            {
              number: 42,
              title: 'fix',
              state: 'open',
              draft: false,
              created_at: new Date().toISOString(),
            },
          ],
        }),
      },
      actions: {
        listWorkflowRunsForRepo: async () => ({
          data: {
            workflow_runs: overrides?.workflowRuns ?? [
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
          data: overrides?.commits ?? [
            {
              sha: 'abc123',
              commit: {
                message: 'initial',
                author: { name: 'alice', date: new Date().toISOString() },
              },
            },
          ],
        }),
      },
    },
  } as unknown as GitHubClient;
}

describe('scanRepoHandler', () => {
  test('returns findings on happy path', async () => {
    const llm = fakeLlm(
      JSON.stringify({
        summary: 'repo looks healthy with minor issues',
        findings: [
          {
            severity: 'medium',
            title: 'old deps',
            description: 'some deps are outdated',
            category: 'maintenance',
            relatedUrls: [],
          },
        ],
      }),
    );
    const client = makeClient();
    const result = await scanRepoHandler(client, llm, { owner: 'o', repo: 'r' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toContain('healthy');
    expect(result.value.findings).toHaveLength(1);
    const f0 = result.value.findings[0];
    expect(f0?.title).toBe('old deps');
    expect(result.value.llmModel).toBe('scan-m');
    expect(result.value.issuesCreated).toBe(0);
  });

  test('creates issues when createIssues=true', async () => {
    const createdIssues: Array<{ title: string; body: string; labels: string[] }> = [];
    const client = {
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
          create: async (input: {
            owner: string;
            repo: string;
            title: string;
            body: string;
            labels: string[];
          }) => {
            createdIssues.push(input);
            return { data: { number: 99 } };
          },
        },
        pulls: { list: async () => ({ data: [] }) },
        actions: { listWorkflowRunsForRepo: async () => ({ data: { workflow_runs: [] } }) },
        repos: { listCommits: async () => ({ data: [] }) },
      },
    } as unknown as GitHubClient;

    const llm = fakeLlm(
      JSON.stringify({
        summary: 'needs work',
        findings: [
          {
            severity: 'high',
            title: 'security flaw',
            description: 'xss in login',
            category: 'security',
            relatedUrls: [],
          },
          {
            severity: 'low',
            title: 'typo',
            description: 'typo in readme',
            category: 'maintenance',
            relatedUrls: [],
          },
        ],
      }),
    );
    const result = await scanRepoHandler(client, llm, {
      owner: 'o',
      repo: 'r',
      createIssues: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.issuesCreated).toBe(2);
    expect(createdIssues).toHaveLength(2);
    const ci0 = createdIssues[0];
    expect(ci0?.title).toContain('[scan/high] security flaw');
    expect(ci0?.labels).toEqual(['security']);
  });

  test('returns INTERNAL_ERROR on non-JSON LLM', async () => {
    const llm = fakeLlm('the repo looks fine');
    const client = makeClient();
    const result = await scanRepoHandler(client, llm, { owner: 'o', repo: 'r' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('INTERNAL_ERROR');
  });
});
