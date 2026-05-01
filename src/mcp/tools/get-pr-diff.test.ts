import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { getPrDiffHandler } from './get-pr-diff.ts';

function fakeClient(impl: () => Promise<{ data: unknown }>): GitHubClient {
  return { request: impl } as unknown as GitHubClient;
}

const tinyDiff = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@\n-old\n+new\n';

describe('getPrDiffHandler', () => {
  test('returns full diff when under maxBytes', async () => {
    const client = fakeClient(async () => ({ data: tinyDiff }));
    const r = await getPrDiffHandler(client, {
      owner: 'x',
      repo: 'y',
      number: 1,
      maxBytes: 1_048_576,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(false);
    expect(r.value.diff).toBe(tinyDiff);
    expect(r.value.bytes).toBe(Buffer.byteLength(tinyDiff, 'utf8'));
  });

  test('truncates at next newline when over maxBytes', async () => {
    const long = `${'a'.repeat(100)}\n${'b'.repeat(100)}\n${'c'.repeat(100)}\n`;
    const client = fakeClient(async () => ({ data: long }));
    const r = await getPrDiffHandler(client, {
      owner: 'x',
      repo: 'y',
      number: 1,
      maxBytes: 50,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(true);
    expect(r.value.diff.endsWith('\n')).toBe(true);
    expect(r.value.bytes).toBe(Buffer.byteLength(long, 'utf8'));
  });

  test('rejects non-string data with INTERNAL_ERROR', async () => {
    const client = fakeClient(async () => ({ data: { not: 'a string' } }));
    const r = await getPrDiffHandler(client, {
      owner: 'x',
      repo: 'y',
      number: 1,
      maxBytes: 1024,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('INTERNAL_ERROR');
  });

  test('maps 404 to NOT_FOUND', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    });
    const r = await getPrDiffHandler(client, {
      owner: 'x',
      repo: 'y',
      number: 999,
      maxBytes: 1024,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('NOT_FOUND');
  });
});
