import { describe, expect, test } from 'bun:test';
import { err, flatMap, isErr, isOk, map, mapErr, ok, tryCatch, unwrapOr } from './result.ts';

describe('Result', () => {
  test('ok / isOk', () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (r.ok) expect(r.value).toBe(42);
  });

  test('err / isErr', () => {
    const r = err('boom');
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (!r.ok) expect(r.error).toBe('boom');
  });

  test('map transforms only Ok', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(map(err('e'), (n: number) => n * 3)).toEqual(err('e'));
  });

  test('mapErr transforms only Err', () => {
    expect(mapErr(ok(2), (e: string) => `${e}!`)).toEqual(ok(2));
    expect(mapErr(err('e'), (e) => `${e}!`)).toEqual(err('e!'));
  });

  test('flatMap chains Result-returning fns', () => {
    const half = (n: number) => (n % 2 === 0 ? ok(n / 2) : err('odd'));
    expect(flatMap(ok(8), half)).toEqual(ok(4));
    expect(flatMap(ok(7), half)).toEqual(err('odd'));
    expect(flatMap(err('e'), half)).toEqual(err('e'));
  });

  test('unwrapOr returns value or fallback', () => {
    expect(unwrapOr(ok(1), 0)).toBe(1);
    expect(unwrapOr(err('e'), 0)).toBe(0);
  });

  test('tryCatch catches throws', async () => {
    const success = await tryCatch(
      async () => 1,
      (e) => String(e),
    );
    expect(success).toEqual(ok(1));

    const failure = await tryCatch(
      async () => {
        throw new Error('nope');
      },
      (e) => (e as Error).message,
    );
    expect(failure).toEqual(err('nope'));
  });
});
