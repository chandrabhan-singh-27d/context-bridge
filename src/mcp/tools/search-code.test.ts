import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { searchCodeHandler } from './search-code.ts';

interface FakeMatch {
  path: string;
  name: string;
  sha: string;
  html_url: string;
  score: number;
}

interface FakeResponse {
  data: { total_count: number; incomplete_results: boolean; items: FakeMatch[] };
}

function fakeClient(
  impl: (params: { q: string; per_page: number }) => Promise<FakeResponse>,
): GitHubClient {
  return { rest: { search: { code: impl } } } as unknown as GitHubClient;
}

describe('searchCodeHandler', () => {
  test('appends repo qualifier to query', async () => {
    let capturedQ = '';
    const client = fakeClient(async (params) => {
      capturedQ = params.q;
      return { data: { total_count: 0, incomplete_results: false, items: [] } };
    });
    await searchCodeHandler(client, { owner: 'x', repo: 'y', query: 'foo bar', limit: 30 });
    expect(capturedQ).toBe('foo bar repo:x/y');
  });

  test('maps matches to CodeMatch', async () => {
    const client = fakeClient(async () => ({
      data: {
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            path: 'src/x.ts',
            name: 'x.ts',
            sha: 'sha1',
            html_url: 'https://github.com/x/y/blob/main/src/x.ts',
            score: 1.5,
          },
        ],
      },
    }));
    const r = await searchCodeHandler(client, { owner: 'x', repo: 'y', query: 'foo', limit: 30 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.totalCount).toBe(1);
    expect(r.value.items[0]?.path).toBe('src/x.ts');
    expect(r.value.items[0]?.score).toBe(1.5);
  });

  test('maps 403 rate-limit to RATE_LIMIT_ERROR', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('rate limited'), {
        status: 403,
        response: {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1700000000',
          },
        },
      });
    });
    const r = await searchCodeHandler(client, { owner: 'x', repo: 'y', query: 'foo', limit: 30 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('RATE_LIMIT_ERROR');
  });
});
