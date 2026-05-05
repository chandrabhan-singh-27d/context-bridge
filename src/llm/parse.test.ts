import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { parseLlmJson } from './parse.ts';

const schema = z.object({
  summary: z.string(),
  labels: z.array(z.string()),
});

describe('parseLlmJson', () => {
  test('parses bare JSON', () => {
    const result = parseLlmJson('{"summary":"x","labels":["a"]}', schema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.summary).toBe('x');
  });

  test('strips ```json fence', () => {
    const raw = '```json\n{"summary":"x","labels":[]}\n```';
    const result = parseLlmJson(raw, schema);
    expect(result.ok).toBe(true);
  });

  test('strips bare ``` fence', () => {
    const raw = '```\n{"summary":"x","labels":[]}\n```';
    const result = parseLlmJson(raw, schema);
    expect(result.ok).toBe(true);
  });

  test('returns INTERNAL_ERROR on invalid JSON', () => {
    const result = parseLlmJson('not json at all', schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('INTERNAL_ERROR');
      expect(result.error.message).toContain('not valid JSON');
    }
  });

  test('returns INTERNAL_ERROR on schema mismatch', () => {
    const result = parseLlmJson('{"summary":"x"}', schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('INTERNAL_ERROR');
      expect(result.error.message).toContain('schema validation');
    }
  });
});
