/**
 * AppError — discriminated union of every error type the application can
 * surface. Each variant has a `type` tag so handlers can switch exhaustively.
 *
 * Add a new variant:
 *   1. Append to AppError below.
 *   2. Add a constructor in the namespace at the bottom.
 *   3. The compiler will then force every exhaustive switch to handle it.
 */

export type ValidationIssue = {
  readonly path: ReadonlyArray<PropertyKey>;
  readonly message: string;
};

export type ValidationError = {
  readonly type: 'VALIDATION_ERROR';
  readonly field: string;
  readonly message: string;
  readonly issues?: ReadonlyArray<ValidationIssue>;
};

export type AuthError = {
  readonly type: 'AUTH_ERROR';
  readonly reason: 'missing_token' | 'invalid_token' | 'insufficient_scope';
  readonly message: string;
};

export type GithubApiError = {
  readonly type: 'GITHUB_API_ERROR';
  readonly status: number;
  readonly message: string;
  readonly endpoint: string;
};

export type RateLimitError = {
  readonly type: 'RATE_LIMIT_ERROR';
  readonly resetAt: number; // unix ms
  readonly remaining: number;
  readonly message: string;
};

export type NotFoundError = {
  readonly type: 'NOT_FOUND';
  readonly resource: string;
  readonly message: string;
};

export type InternalError = {
  readonly type: 'INTERNAL_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type AppError =
  | ValidationError
  | AuthError
  | GithubApiError
  | RateLimitError
  | NotFoundError
  | InternalError;

export const AppError = {
  validation: (
    field: string,
    message: string,
    issues?: ReadonlyArray<ValidationIssue>,
  ): ValidationError =>
    issues === undefined
      ? { type: 'VALIDATION_ERROR', field, message }
      : { type: 'VALIDATION_ERROR', field, message, issues },

  auth: (reason: AuthError['reason'], message: string): AuthError => ({
    type: 'AUTH_ERROR',
    reason,
    message,
  }),

  githubApi: (status: number, message: string, endpoint: string): GithubApiError => ({
    type: 'GITHUB_API_ERROR',
    status,
    message,
    endpoint,
  }),

  rateLimit: (resetAt: number, remaining: number, message: string): RateLimitError => ({
    type: 'RATE_LIMIT_ERROR',
    resetAt,
    remaining,
    message,
  }),

  notFound: (resource: string, message: string): NotFoundError => ({
    type: 'NOT_FOUND',
    resource,
    message,
  }),

  internal: (message: string, cause?: unknown): InternalError => {
    const base: InternalError = { type: 'INTERNAL_ERROR', message };
    if (cause === undefined) return base;
    Object.defineProperty(base, 'cause', {
      value: cause,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    return base;
  },
} as const;

/**
 * Type guard that tells the compiler a value is an AppError. Useful at
 * boundaries where the value is `unknown` (e.g. caught exceptions).
 */
export function isAppError(value: unknown): value is AppError {
  if (value === null || typeof value !== 'object') return false;
  const tag = (value as { type?: unknown }).type;
  return (
    tag === 'VALIDATION_ERROR' ||
    tag === 'AUTH_ERROR' ||
    tag === 'GITHUB_API_ERROR' ||
    tag === 'RATE_LIMIT_ERROR' ||
    tag === 'NOT_FOUND' ||
    tag === 'INTERNAL_ERROR'
  );
}

/**
 * Convert any AppError to a human-safe string. Never includes secrets or
 * raw causes — those go to the structured logger, not user-facing output.
 */
export function formatAppError(e: AppError): string {
  switch (e.type) {
    case 'VALIDATION_ERROR':
      return `validation failed for "${e.field}": ${e.message}`;
    case 'AUTH_ERROR':
      return `auth: ${e.reason} — ${e.message}`;
    case 'GITHUB_API_ERROR':
      return `github ${e.status} on ${e.endpoint}: ${e.message}`;
    case 'RATE_LIMIT_ERROR':
      return `rate limited (${e.remaining} remaining, resets at ${new Date(e.resetAt).toISOString()})`;
    case 'NOT_FOUND':
      return `${e.resource} not found: ${e.message}`;
    case 'INTERNAL_ERROR':
      return `internal error: ${e.message}`;
  }
}
