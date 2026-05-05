import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { ok } from '../../lib/result.ts';
import type { ChatRequest, LlmProvider } from '../../llm/provider.ts';
import { triagePrHandler } from './triage-pr.ts';

interface FakeOps {
  pr?: {
    title?: string;
    body?: string | null;
    state?: string;
    draft?: boolean;
    user?: { login: string };
    base?: { ref: string };
    head?: { ref: string };
    additions?: number;
    deletions?: number;
    changed_files?: number;
    labels?: ReadonlyArray<{ name: string }>;
  };
  diff?: string;
  prThrows?: unknown;
}

function fakeClient(ops: FakeOps): GitHubClient {
  return {
    rest: {
      pulls: {
        get: async () => {
          if (ops.prThrows !== undefined) throw ops.prThrows;
          return {
            data: {
              title: ops.pr?.title ?? 't',
              body: ops.pr?.body ?? null,
              state: ops.pr?.state ?? 'open',
              draft: ops.pr?.draft ?? false,
              user: ops.pr?.user ?? { login: 'alice' },
              base: ops.pr?.base ?? { ref: 'main' },
              head: ops.pr?.head ?? { ref: 'feat' },
              additions: ops.pr?.additions ?? 0,
              deletions: ops.pr?.deletions ?? 0,
              changed_files: ops.pr?.changed_files ?? 0,
              labels: ops.pr?.labels ?? [],
            },
          };
        },
      },
    },
    request: async () => ({ data: ops.diff ?? '' }),
  } as unknown as GitHubClient;
}

function fakeLlm(content: string, model = 'fake-m'): LlmProvider {
  let captured: ChatRequest | undefined;
  return {
    name: 'fake',
    model,
    chat: async (req: ChatRequest) => {
      captured = req;
      return ok({ content, model });
    },
    // expose for assertions
    get lastRequest() {
      return captured;
    },
  } as unknown as LlmProvider;
}

describe('triagePrHandler', () => {
  test('returns parsed triage on happy path', async () => {
    const llm = fakeLlm(
      JSON.stringify({
        summary: 'adds caching layer',
        riskAreas: ['eviction policy untested'],
        suggestedLabels: ['feature'],
        reviewerNotes: ['check TTL handling'],
      }),
    );
    const client = fakeClient({
      pr: { title: 'add cache', additions: 100, deletions: 5, changed_files: 3 },
      diff: 'diff --git a/x b/x\n+new line',
    });
    const result = await triagePrHandler(client, llm, { owner: 'o', repo: 'r', number: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toContain('caching');
      expect(result.value.suggestedLabels).toEqual(['feature']);
      expect(result.value.diffTruncated).toBe(false);
    }
  });

  test('marks diffTruncated when diff exceeds cap', async () => {
    const llm = fakeLlm(
      JSON.stringify({
        summary: 's',
        riskAreas: [],
        suggestedLabels: [],
        reviewerNotes: [],
      }),
    );
    const giantDiff = 'x'.repeat(300_000);
    const client = fakeClient({ diff: giantDiff });
    const result = await triagePrHandler(client, llm, { owner: 'o', repo: 'r', number: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.diffTruncated).toBe(true);
  });

  test('returns INTERNAL_ERROR on schema mismatch', async () => {
    const llm = fakeLlm('{"summary":"x"}');
    const client = fakeClient({});
    const result = await triagePrHandler(client, llm, { owner: 'o', repo: 'r', number: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('INTERNAL_ERROR');
  });

  test('propagates 404 from PR fetch', async () => {
    const llm = fakeLlm('{}');
    const client = fakeClient({ prThrows: Object.assign(new Error('nf'), { status: 404 }) });
    const result = await triagePrHandler(client, llm, { owner: 'o', repo: 'r', number: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('NOT_FOUND');
  });
});
