import type { ZodType } from 'zod';
import { AppError } from '../lib/errors.ts';
import { err, ok, type Result } from '../lib/result.ts';

/**
 * Strip surrounding ```json fences (or any code fence) the LLM may have
 * wrapped the JSON in despite being asked not to.
 */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  return (fenceMatch?.[1] ?? trimmed).trim();
}

/**
 * Parse and validate an LLM response against a Zod schema. Returns a
 * tagged AppError on parse or shape failure so the caller can surface it
 * uniformly.
 */
export function parseLlmJson<T>(raw: string, schema: ZodType<T>): Result<T, AppError> {
  const stripped = stripCodeFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (cause) {
    return err(AppError.internal('llm response was not valid JSON', cause));
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    const summary = validated.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return err(AppError.internal(`llm response failed schema validation: ${summary}`));
  }
  return ok(validated.data);
}
