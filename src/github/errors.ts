import { AppError } from '../lib/errors.ts';

/**
 * Map an Octokit / fetch error into an AppError. Centralized so every
 * GitHub-touching call site stays consistent and the AppError union remains
 * the only error currency in business logic.
 */
export function mapGitHubError(e: unknown, endpoint: string): AppError {
  const status = (e as { status?: number })?.status ?? 0;
  const message = (e as { message?: string })?.message ?? 'unknown error';

  if (status === 401) return AppError.auth('invalid_token', message);
  if (status === 403) {
    const remaining = Number(
      (e as { response?: { headers?: Record<string, string> } })?.response?.headers?.[
        'x-ratelimit-remaining'
      ] ?? 1,
    );
    if (remaining === 0) {
      const reset =
        Number(
          (e as { response?: { headers?: Record<string, string> } })?.response?.headers?.[
            'x-ratelimit-reset'
          ] ?? 0,
        ) * 1000;
      return AppError.rateLimit(reset, 0, message);
    }
    return AppError.auth('insufficient_scope', message);
  }
  if (status === 404) return AppError.notFound(endpoint, message);
  if (status >= 400) return AppError.githubApi(status, message, endpoint);
  return AppError.internal(`request failed: ${endpoint}`, e);
}
