import { type ChildProcess, spawn } from 'node:child_process';
import { AppError, formatAppError } from '../../src/lib/errors.ts';
import { err, ok, type Result } from '../../src/lib/result.ts';

type JsonRpcId = number | string;

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type McpBridgeOptions = {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env?: Record<string, string>;
  readonly requestTimeoutMs?: number;
  readonly onStderr?: (line: string) => void;
};

type Pending = {
  resolve: (value: Result<unknown, AppError>) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type McpBridge = {
  initialize(): Promise<Result<unknown, AppError>>;
  listTools(): Promise<Result<{ tools: ReadonlyArray<unknown> }, AppError>>;
  callTool(name: string, args: Record<string, unknown>): Promise<Result<unknown, AppError>>;
  shutdown(): Promise<void>;
  isAlive(): boolean;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export function createMcpBridge(opts: McpBridgeOptions): McpBridge {
  const child: ChildProcess = spawn(opts.command, [...opts.args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(opts.env ?? {}) },
  });

  const pending = new Map<JsonRpcId, Pending>();
  let nextId = 1;
  let stdoutBuf = '';
  let stderrBuf = '';
  let exited = false;
  let initialized = false;

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');

  child.stdout?.on('data', (chunk: string) => {
    stdoutBuf += chunk;
    let nl = stdoutBuf.indexOf('\n');
    while (nl !== -1) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (line.length > 0) handleLine(line);
      nl = stdoutBuf.indexOf('\n');
    }
  });

  child.stderr?.on('data', (chunk: string) => {
    stderrBuf += chunk;
    let nl = stderrBuf.indexOf('\n');
    while (nl !== -1) {
      const line = stderrBuf.slice(0, nl);
      stderrBuf = stderrBuf.slice(nl + 1);
      opts.onStderr?.(line);
      nl = stderrBuf.indexOf('\n');
    }
  });

  child.on('exit', (code) => {
    exited = true;
    const e = AppError.internal(`mcp child exited with code ${code ?? 'null'}`);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.resolve(err(e));
    }
    pending.clear();
  });

  child.on('error', (e) => {
    exited = true;
    const wrapped = AppError.internal(`mcp child spawn error: ${e.message}`, e);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.resolve(err(wrapped));
    }
    pending.clear();
  });

  function handleLine(line: string): void {
    let parsed: JsonRpcResponse;
    try {
      parsed = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return;
    }
    if (typeof parsed.id !== 'number' && typeof parsed.id !== 'string') return;
    const p = pending.get(parsed.id);
    if (p === undefined) return;
    pending.delete(parsed.id);
    clearTimeout(p.timer);
    if (parsed.error !== undefined) {
      p.resolve(err(AppError.internal(`mcp error: ${parsed.error.message}`)));
      return;
    }
    p.resolve(ok(parsed.result));
  }

  function send(method: string, params: unknown): Promise<Result<unknown, AppError>> {
    if (exited || child.stdin === null || child.stdin.destroyed) {
      return Promise.resolve(err(AppError.internal('mcp child not alive')));
    }
    const id = nextId++;
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const timeout = opts.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(err(AppError.internal(`mcp request "${method}" timed out after ${timeout}ms`)));
      }, timeout);
      pending.set(id, { resolve, timer });
      child.stdin?.write(`${JSON.stringify(req)}\n`, (e) => {
        if (e) {
          pending.delete(id);
          clearTimeout(timer);
          resolve(err(AppError.internal(`mcp stdin write failed: ${e.message}`, e)));
        }
      });
    });
  }

  async function initialize(): Promise<Result<unknown, AppError>> {
    if (initialized) return ok({});
    const r = await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'context-bridge-companion-ui', version: '0.0.1' },
    });
    if (!r.ok) return r;
    if (exited || child.stdin === null) {
      return err(AppError.internal('mcp child died before initialize complete'));
    }
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    );
    initialized = true;
    return ok(r.value);
  }

  async function listTools(): Promise<Result<{ tools: ReadonlyArray<unknown> }, AppError>> {
    const init = await initialize();
    if (!init.ok) return init;
    const r = await send('tools/list', {});
    if (!r.ok) return r;
    const v = r.value as { tools?: ReadonlyArray<unknown> } | undefined;
    if (v === undefined || !Array.isArray(v.tools)) {
      return err(AppError.internal('tools/list returned unexpected shape'));
    }
    return ok({ tools: v.tools });
  }

  async function callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Result<unknown, AppError>> {
    const init = await initialize();
    if (!init.ok) return init;
    return send('tools/call', { name, arguments: args });
  }

  async function shutdown(): Promise<void> {
    if (exited) return;
    child.stdin?.end();
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        child.kill('SIGTERM');
        resolve();
      }, 1_000);
      child.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  return {
    initialize,
    listTools,
    callTool,
    shutdown,
    isAlive: () => !exited,
  };
}

export function describeBridgeError(e: AppError): string {
  return formatAppError(e);
}
