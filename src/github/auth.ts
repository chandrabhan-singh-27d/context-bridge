import type { AppError } from '../lib/errors.ts';
import { type Result, ok, tryCatch } from '../lib/result.ts';
import type { GitHubClient } from './client.ts';
import { mapGitHubError } from './errors.ts';

export interface AuthIdentity {
  readonly login: string;
}

export async function verifyAuth(client: GitHubClient): Promise<Result<AuthIdentity, AppError>> {
  const r = await tryCatch(
    () => client.rest.users.getAuthenticated(),
    (e) => mapGitHubError(e, 'GET /user'),
  );
  if (!r.ok) return r;
  return ok({ login: r.value.data.login });
}
