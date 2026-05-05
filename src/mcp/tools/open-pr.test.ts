import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { openPrHandler } from './open-pr.ts';

interface FakeOps {
  getRefThrows?: unknown;
  pullsCreate?: (args: {
    head: string;
    base: string;
    title: string;
    body: string;
    draft?: boolean | undefined;
  }) => Promise<{ data: { number: number; html_url: string; draft?: boolean } }>;
}

function fakeClient(ops: FakeOps): GitHubClient {
  return {
    rest: {
      git: {
        getRef: async () => {
          if (ops.getRefThrows !== undefined) throw ops.getRefThrows;
          return { data: { object: { sha: 'a' } } };
        },
      },
      pulls: {
        create:
          ops.pullsCreate ??
          (async () => ({
            data: { number: 42, html_url: 'https://github.com/o/r/pull/42', draft: false },
          })),
      },
    },
  } as unknown as GitHubClient;
}

describe('openPrHandler', () => {
  test('happy path returns number + url', async () => {
    const client = fakeClient({});
    const r = await openPrHandler(client, {
      owner: 'o',
      repo: 'r',
      head: 'feat',
      base: 'main',
      title: 't',
      body: 'b',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.number).toBe(42);
      expect(r.value.draft).toBe(false);
    }
  });

  test('rejects head === base', async () => {
    const client = fakeClient({});
    const r = await openPrHandler(client, {
      owner: 'o',
      repo: 'r',
      head: 'main',
      base: 'main',
      title: 't',
      body: 'b',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('VALIDATION_ERROR');
  });

  test('maps missing head ref (404) to NOT_FOUND', async () => {
    const client = fakeClient({
      getRefThrows: Object.assign(new Error('nf'), { status: 404 }),
    });
    const r = await openPrHandler(client, {
      owner: 'o',
      repo: 'r',
      head: 'missing',
      base: 'main',
      title: 't',
      body: 'b',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('NOT_FOUND');
  });

  test('passes draft flag through', async () => {
    let captured: { draft?: boolean | undefined } = {};
    const client = fakeClient({
      pullsCreate: async (args) => {
        captured = { draft: args.draft };
        return {
          data: {
            number: 1,
            html_url: 'https://github.com/o/r/pull/1',
            draft: args.draft ?? false,
          },
        };
      },
    });
    const r = await openPrHandler(client, {
      owner: 'o',
      repo: 'r',
      head: 'a',
      base: 'b',
      title: 't',
      body: 'b',
      draft: true,
    });
    expect(r.ok).toBe(true);
    expect(captured.draft).toBe(true);
  });
});
