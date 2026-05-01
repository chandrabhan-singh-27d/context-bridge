import { AppError } from '../lib/errors.ts';
import { type Result, ok, tryCatch } from '../lib/result.ts';
import type { GitHubClient } from './client.ts';

export interface AuthIdentity {
  readonly login: string;
}

export async function verifyAuth(client: GitHubClient): Promise<Result<AuthIdentity, AppError>> {
  const r = await tryCatch(
    () => client.rest.users.getAuthenticated(),
    (e) => mapAuthError(e),
  );
  if (!r.ok) return r;
  return ok({ login: r.value.data.login });
}

function mapAuthError(e: unknown): AppError {
  const status = (e as { status?: number })?.status;
  const message = (e as { message?: string })?.message ?? 'unknown auth failure';
  if (status === 401) return AppError.auth('invalid_token', 'GitHub rejected the token');
  if (status === 403) return AppError.auth('insufficient_scope', message);
  return AppError.internal('failed to authenticate with GitHub', e);
}
