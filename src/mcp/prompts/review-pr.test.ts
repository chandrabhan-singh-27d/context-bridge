import { describe, expect, test } from 'bun:test';
import { buildReviewPrPrompt } from './review-pr.ts';

describe('buildReviewPrPrompt', () => {
  test('embeds owner/repo/number into instructions', () => {
    const r = buildReviewPrPrompt({ owner: 'acme', repo: 'widgets', number: 42 });
    expect(r.messages.length).toBe(1);
    expect(r.messages[0]?.role).toBe('user');
    const msg = r.messages[0];
    if (!msg || msg.content.type !== 'text') throw new Error('expected text');
    expect(msg.content.text).toContain('acme/widgets');
    expect(msg.content.text).toContain('#42');
    expect(msg.content.text).toContain('get_pr_diff');
    expect(msg.content.text).toContain('list_review_comments');
  });

  test('includes structured review sections', () => {
    const r = buildReviewPrPrompt({ owner: 'a', repo: 'b', number: 1 });
    const msg = r.messages[0];
    if (!msg || msg.content.type !== 'text') throw new Error('expected text');
    expect(msg.content.text).toContain('Correctness');
    expect(msg.content.text).toContain('Security');
    expect(msg.content.text).toContain('Tests');
    expect(msg.content.text).toContain('Maintainability');
  });
});
