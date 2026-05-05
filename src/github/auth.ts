import { AppError } from '../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../lib/result.ts';
import type { GitHubClient } from './client.ts';
import { mapGitHubError } from './errors.ts';

export interface AuthIdentity {
  readonly login: string;
  /**
   * OAuth scopes parsed from `x-oauth-scopes` (classic PATs).
   * Empty array for fine-grained tokens (header is absent), so the array
   * being empty does not mean "no permissions".
   */
  readonly scopes: ReadonlyArray<string>;
}

function parseScopesHeader(headers: Record<string, unknown> | undefined): ReadonlyArray<string> {
  const raw = headers?.['x-oauth-scopes'];
  if (typeof raw !== 'string' || raw.length === 0) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function verifyAuth(client: GitHubClient): Promise<Result<AuthIdentity, AppError>> {
  const fetched = await tryCatch(
    () => client.rest.users.getAuthenticated(),
    (cause) => mapGitHubError(cause, 'GET /user'),
  );
  if (!fetched.ok) return fetched;
  const headers = (fetched.value as { headers?: Record<string, unknown> }).headers;
  return ok({
    login: fetched.value.data.login,
    scopes: parseScopesHeader(headers),
  });
}

/**
 * Best-effort assertion that the token can perform the write tools surfaced
 * in this server. Classic PATs expose `x-oauth-scopes`; fine-grained tokens
 * do not. When scopes are empty we assume fine-grained and pass — actual
 * permission failures surface as 403 from the per-tool calls.
 */
export function assertWriteScopes(scopes: ReadonlyArray<string>): Result<void, AppError> {
  if (scopes.length === 0) return ok(undefined);
  const hasWrite = scopes.includes('repo') || scopes.includes('public_repo');
  if (hasWrite) return ok(undefined);
  return err(
    AppError.auth(
      'insufficient_scope',
      `WRITES_ENABLED=true but token scopes [${scopes.join(', ')}] do not include "repo" or "public_repo"`,
    ),
  );
}
