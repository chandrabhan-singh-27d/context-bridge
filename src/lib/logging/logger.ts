/**
 * Structured logger. JSON output to stderr (stdout is reserved for the MCP
 * stdio transport). Levels: debug | info | warn | error.
 *
 * Design notes:
 * - Pure function over fields; no global mutable state beyond the configured
 *   minimum level. Tests can construct isolated loggers.
 * - Redaction of sensitive keys (token, authorization, etc.) is applied
 *   automatically. Never log raw `process.env` or HTTP headers without
 *   running them through `redact()` first.
 * - Child loggers inherit context, useful for per-request bindings.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const REDACT_KEY_PATTERN = /\b(token|password|secret|api[_-]?key|authorization|cookie|bearer)\b/i;
const REDACTED = '[REDACTED]';

export interface LoggerSink {
  write(line: string): void;
}

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly sink?: LoggerSink;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly clock?: () => Date;
}

export interface Logger {
  readonly level: LogLevel;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(context: Readonly<Record<string, unknown>>): Logger;
}

const defaultSink: LoggerSink = {
  write(line) {
    // stderr only — stdout is owned by MCP stdio transport.
    process.stderr.write(`${line}\n`);
  },
};

export function redact<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v)) as unknown as T;
  if (!isPlainObject(value)) return '[REDACTED-NON-PLAIN]' as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEY_PATTERN.test(k) ? REDACTED : redact(v);
  }
  return out as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const level: LogLevel = opts.level ?? 'info';
  const sink: LoggerSink = opts.sink ?? defaultSink;
  const baseContext = opts.context ?? {};
  const clock = opts.clock ?? (() => new Date());

  function emit(at: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
    if (LEVEL_RANK[at] < LEVEL_RANK[level]) return;
    const record = redact({
      ts: clock().toISOString(),
      level: at,
      msg,
      ...baseContext,
      ...fields,
    });
    sink.write(JSON.stringify(record));
  }

  return {
    level,
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (context) =>
      createLogger({
        level,
        sink,
        context: { ...baseContext, ...context },
        clock,
      }),
  };
}
