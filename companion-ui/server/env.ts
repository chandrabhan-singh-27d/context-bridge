import { z } from 'zod';
import { AppError, type ValidationError } from '../../src/lib/errors.ts';
import { err, ok, type Result } from '../../src/lib/result.ts';

const envSchema = z.object({
  COMPANION_PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  COMPANION_HOST: z.string().default('127.0.0.1'),
  COMPANION_RATE_CAPACITY: z.coerce.number().int().min(1).max(10_000).default(30),
  COMPANION_RATE_REFILL_PER_SEC: z.coerce.number().min(0.01).max(1_000).default(1),
  COMPANION_MCP_COMMAND: z.string().default('bun'),
  COMPANION_MCP_ARGS: z.string().default('run src/server.ts'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type CompanionEnv = z.infer<typeof envSchema>;

export function loadCompanionEnv(
  source: Record<string, string | undefined> = process.env,
): Result<CompanionEnv, ValidationError> {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return ok(parsed.data);
  const issues = parsed.error.issues.map((i) => ({ path: i.path, message: i.message }));
  const firstField = String(parsed.error.issues[0]?.path[0] ?? '<env>');
  const summary = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  return err(AppError.validation(firstField, summary, issues));
}
