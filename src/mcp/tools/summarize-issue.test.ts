import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { ok } from '../../lib/result.ts';
import type { ChatRequest, LlmProvider } from '../../llm/provider.ts';
import { summarizeIssueHandler } from './summarize-issue.ts';

interface FakeOps {
  issue?: {
    title?: string;
    body?: string | null;
    state?: string;
    labels?: ReadonlyArray<string | { name?: string }>;
    user?: { login: string };
  };
  comments?: ReadonlyArray<{ user?: { login: string }; body?: string }>;
  issueThrows?: unknown;
}

function fakeClient(ops: FakeOps): GitHubClient {
  return {
    rest: {
      issues: {
        get: async () => {
          if (ops.issueThrows !== undefined) throw ops.issueThrows;
          return {
            data: {
              title: ops.issue?.title ?? 't',
              body: ops.issue?.body ?? null,
              state: ops.issue?.state ?? 'open',
              labels: ops.issue?.labels ?? [],
              user: ops.issue?.user ?? { login: 'reporter' },
            },
          };
        },
        listComments: async () => ({ data: ops.comments ?? [] }),
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

describe('summarizeIssueHandler', () => {
  test('returns parsed summary on happy path', async () => {
    const llm = fakeLlm(
      JSON.stringify({
        summary: 'login crashes on empty email',
        suggestedLabels: ['bug', 'auth'],
        suggestedNextSteps: ['add validation', 'write regression test'],
      }),
    );
    const client = fakeClient({
      issue: { title: 'crash on login', body: 'empty email crashes' },
      comments: [{ user: { login: 'alice' }, body: 'reproduced' }],
    });
    const result = await summarizeIssueHandler(client, llm, {
      owner: 'o',
      repo: 'r',
      number: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toContain('login');
      expect(result.value.suggestedLabels).toEqual(['bug', 'auth']);
      expect(result.value.llmModel).toBe('fake-m');
    }
  });

  test('strips ```json fence in LLM output', async () => {
    const llm = fakeLlm(
      '```json\n{"summary":"x","suggestedLabels":[],"suggestedNextSteps":[]}\n```',
    );
    const client = fakeClient({});
    const result = await summarizeIssueHandler(client, llm, {
      owner: 'o',
      repo: 'r',
      number: 1,
    });
    expect(result.ok).toBe(true);
  });

  test('returns INTERNAL_ERROR when LLM emits non-JSON', async () => {
    const llm = fakeLlm('the issue is about login');
    const client = fakeClient({});
    const result = await summarizeIssueHandler(client, llm, {
      owner: 'o',
      repo: 'r',
      number: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('INTERNAL_ERROR');
  });

  test('propagates 404 from issue fetch', async () => {
    const llm = fakeLlm('{}');
    const client = fakeClient({ issueThrows: Object.assign(new Error('nf'), { status: 404 }) });
    const result = await summarizeIssueHandler(client, llm, {
      owner: 'o',
      repo: 'r',
      number: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('NOT_FOUND');
  });
});
