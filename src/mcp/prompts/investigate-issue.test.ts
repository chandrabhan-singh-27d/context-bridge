import { describe, expect, test } from 'bun:test';
import { buildInvestigateIssuePrompt } from './investigate-issue.ts';

describe('buildInvestigateIssuePrompt', () => {
  test('embeds owner/repo/number and tool sequence', () => {
    const r = buildInvestigateIssuePrompt({ owner: 'acme', repo: 'widgets', number: 7 });
    expect(r.messages.length).toBe(1);
    const msg = r.messages[0];
    if (!msg || msg.content.type !== 'text') throw new Error('expected text');
    expect(msg.content.text).toContain('acme/widgets');
    expect(msg.content.text).toContain('#7');
    expect(msg.content.text).toContain('search_issues');
    expect(msg.content.text).toContain('search_code');
    expect(msg.content.text).toContain('get_commit_history');
  });

  test('reminds assistant to stay read-only', () => {
    const r = buildInvestigateIssuePrompt({ owner: 'a', repo: 'b', number: 1 });
    const msg = r.messages[0];
    if (!msg || msg.content.type !== 'text') throw new Error('expected text');
    expect(msg.content.text).toContain('read-only');
  });
});
