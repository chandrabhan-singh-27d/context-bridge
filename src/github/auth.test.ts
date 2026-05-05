import { describe, expect, test } from 'bun:test';
import { assertWriteScopes, verifyAuth } from './auth.ts';
import type { GitHubClient } from './client.ts';

function fakeClient(
  impl: () => Promise<{ data: { login: string }; headers?: Record<string, unknown> }>,
): GitHubClient {
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
    expect(r.value.scopes).toEqual([]);
  });

  test('parses x-oauth-scopes header into scopes array', async () => {
    const client = fakeClient(async () => ({
      data: { login: 'u' },
      headers: { 'x-oauth-scopes': 'repo, read:user, gist' },
    }));
    const r = await verifyAuth(client);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.scopes).toEqual(['repo', 'read:user', 'gist']);
  });

  test('empty scopes header → empty array (fine-grained token)', async () => {
    const client = fakeClient(async () => ({
      data: { login: 'u' },
      headers: { 'x-oauth-scopes': '' },
    }));
    const r = await verifyAuth(client);
    if (r.ok) expect(r.value.scopes).toEqual([]);
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

describe('assertWriteScopes', () => {
  test('passes for empty scopes (fine-grained token)', () => {
    const r = assertWriteScopes([]);
    expect(r.ok).toBe(true);
  });

  test('passes when scopes include "repo"', () => {
    const r = assertWriteScopes(['repo', 'read:user']);
    expect(r.ok).toBe(true);
  });

  test('passes when scopes include "public_repo"', () => {
    const r = assertWriteScopes(['public_repo']);
    expect(r.ok).toBe(true);
  });

  test('fails when scopes are read-only', () => {
    const r = assertWriteScopes(['read:user', 'gist']);
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.type === 'AUTH_ERROR') {
      expect(r.error.reason).toBe('insufficient_scope');
    }
  });
});
