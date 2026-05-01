import { describe, expect, test } from 'bun:test';
import { verifyAuth } from './auth.ts';
import type { GitHubClient } from './client.ts';

function fakeClient(impl: () => Promise<{ data: { login: string } }>): GitHubClient {
  return {
    rest: { users: { getAuthenticated: impl } },
  } as unknown as GitHubClient;
}

describe('verifyAuth', () => {
  test('returns the authenticated login on success', async () => {
    const client = fakeClient(async () => ({ data: { login: 'octocat' } }));
    const r = await verifyAuth(client);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.login).toBe('octocat');
  });

  test('maps 401 to AUTH_ERROR/invalid_token', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Bad credentials'), { status: 401 });
    });
    const r = await verifyAuth(client);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('AUTH_ERROR');
    if (r.error.type !== 'AUTH_ERROR') return;
    expect(r.error.reason).toBe('invalid_token');
  });

  test('maps 403 to AUTH_ERROR/insufficient_scope', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    });
    const r = await verifyAuth(client);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('AUTH_ERROR');
    if (r.error.type !== 'AUTH_ERROR') return;
    expect(r.error.reason).toBe('insufficient_scope');
  });
});
