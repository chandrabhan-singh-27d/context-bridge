import { describe, expect, test } from 'bun:test';
import type { GitHubClient } from '../../github/client.ts';
import { readReadme } from './readme.ts';

interface FakeReadme {
  content: string;
  encoding: string;
}

function fakeClient(impl: () => Promise<{ data: FakeReadme }>): GitHubClient {
  return { rest: { repos: { getReadme: impl } } } as unknown as GitHubClient;
}

describe('readReadme', () => {
  test('decodes base64 content to utf8', async () => {
    const text = '# Hello World';
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    const client = fakeClient(async () => ({ data: { content: b64, encoding: 'base64' } }));
    const r = await readReadme(client, { owner: 'x', repo: 'y' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(text);
  });

  test('maps 404 to NOT_FOUND', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    });
    const r = await readReadme(client, { owner: 'x', repo: 'y' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('NOT_FOUND');
  });
});
