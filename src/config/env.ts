import { z } from 'zod';
import { AppError, type ValidationError } from '../lib/errors.ts';
import { type Result, err, ok } from '../lib/result.ts';

/**
 * Environment loader. Single source of truth for runtime configuration.
 *
 * Loading order (highest first): `.env.local` > `.env` > `process.env`.
 * Bun reads dotenv files automatically; this module just validates the
 * resulting `process.env` shape and produces a typed config object.
 *
 * Usage: `const env = loadEnv()` once at startup. Never reach for
 * `process.env.X` directly anywhere else — import the typed `env` instead.
 */

const LogLevel = z.enum(['debug', 'info', 'warn', 'error']);

const RepoSlug = z
  .string()
  .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, 'must be in "owner/repo" form');

const envSchema = z.object({
  GITHUB_TOKEN: z
    .string()
    .min(1, 'GITHUB_TOKEN must be set. Generate at https://github.com/settings/tokens'),
  DEFAULT_REPO: RepoSlug.optional(),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(86_400).default(300),
  LOG_LEVEL: LogLevel.default('info'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse env from any record (defaults to `process.env`). Returns a Result
 * so the caller decides whether to fail fast or fall back. Never throws.
 */
export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Result<Env, ValidationError> {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return ok(parsed.data);

  const issues = parsed.error.issues.map((i) => ({
    path: i.path,
    message: i.message,
  }));
  const firstField = String(parsed.error.issues[0]?.path[0] ?? '<env>');
  const summary = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  return err(AppError.validation(firstField, summary, issues));
}
