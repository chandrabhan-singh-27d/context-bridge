import { describe, expect, test } from 'bun:test';
import { createLogger, redact } from './logger.ts';

function makeSink(): {
  lines: string[];
  sink: { write: (line: string) => void };
  records: () => unknown[];
} {
  const lines: string[] = [];
  return {
    lines,
    sink: { write: (line) => lines.push(line) },
    records: () => lines.map((l) => JSON.parse(l)),
  };
}

describe('redact', () => {
  test('redacts known sensitive keys at any depth', () => {
    const out = redact({
      token: 'gh_xxx',
      nested: { password: 'p', authorization: 'Bearer x', cookie: 'c' },
      arr: [{ api_key: 'k' }],
      safe: 1,
    });
    expect(JSON.stringify(out)).not.toContain('gh_xxx');
    expect(JSON.stringify(out)).not.toContain('Bearer x');
    expect(JSON.stringify(out)).not.toContain('hunter');
    expect((out as { safe: number }).safe).toBe(1);
  });

  test('passes primitives through', () => {
    expect(redact(1)).toBe(1);
    expect(redact('hello')).toBe('hello');
    expect(redact(null)).toBe(null);
  });

  test('replaces non-plain objects (Headers, class instances) with sentinel', () => {
    const headers = new Headers({ authorization: 'Bearer secret' });
    const out = redact({ res: { headers } });
    expect(JSON.stringify(out)).not.toContain('Bearer secret');
    expect((out as unknown as { res: { headers: string } }).res.headers).toBe(
      '[REDACTED-NON-PLAIN]',
    );
  });

  test('replaces Map/Set with sentinel', () => {
    const out = redact({ m: new Map([['token', 'gh_xxx']]), s: new Set(['gh_yyy']) });
    expect(JSON.stringify(out)).not.toContain('gh_xxx');
    expect(JSON.stringify(out)).not.toContain('gh_yyy');
  });
});

describe('createLogger', () => {
  test('writes JSON line per call', () => {
    const { sink, records } = makeSink();
    const log = createLogger({ level: 'debug', sink });
    log.info('hello', { a: 1 });
    const r = records()[0] as { msg: string; level: string; a: number };
    expect(r.msg).toBe('hello');
    expect(r.level).toBe('info');
    expect(r.a).toBe(1);
  });

  test('respects level threshold', () => {
    const { sink, lines } = makeSink();
    const log = createLogger({ level: 'warn', sink });
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(lines).toHaveLength(2);
  });

  test('redacts sensitive fields automatically', () => {
    const { sink, records } = makeSink();
    const log = createLogger({ level: 'debug', sink });
    log.info('login', { token: 'gh_xxx', user: 'me' });
    const r = records()[0] as { token: string; user: string };
    expect(r.token).toBe('[REDACTED]');
    expect(r.user).toBe('me');
  });

  test('child inherits + extends context', () => {
    const { sink, records } = makeSink();
    const root = createLogger({ level: 'debug', sink, context: { service: 'cb' } });
    const child = root.child({ requestId: 'r1' });
    child.info('hit');
    const r = records()[0] as { service: string; requestId: string };
    expect(r.service).toBe('cb');
    expect(r.requestId).toBe('r1');
  });

  test('uses injected clock', () => {
    const { sink, records } = makeSink();
    const log = createLogger({
      level: 'info',
      sink,
      clock: () => new Date('2026-01-01T00:00:00Z'),
    });
    log.info('frozen');
    const r = records()[0] as { ts: string };
    expect(r.ts).toBe('2026-01-01T00:00:00.000Z');
  });
});
