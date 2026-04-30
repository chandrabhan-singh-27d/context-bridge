import { describe, expect, test } from 'bun:test';
import { pingHandler } from './ping.ts';

describe('ping tool', () => {
  test('returns a single text content block', () => {
    const result = pingHandler();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe('text');
  });

  test('text starts with "pong"', () => {
    const result = pingHandler();
    expect(result.content[0]?.text).toMatch(/^pong @ /);
  });

  test('text contains a parseable ISO timestamp', () => {
    const result = pingHandler();
    const text = result.content[0]?.text ?? '';
    const match = text.match(/^pong @ (.+)$/);
    expect(match).not.toBeNull();
    const iso = match?.[1] ?? '';
    const parsed = new Date(iso);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    // Timestamp should be within the last second.
    expect(Date.now() - parsed.getTime()).toBeLessThan(1000);
  });
});
