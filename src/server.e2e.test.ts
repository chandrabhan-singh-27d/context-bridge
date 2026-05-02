/**
 * End-to-end smoke for src/server.ts. Spawns the real binary entry, talks
 * newline-delimited JSON-RPC over stdio, and asserts on the boot path.
 *
 * The "without token" case verifies the env loader fails fast — no network
 * required, runs in CI on every push.
 *
 * The "with token" case is gated on GITHUB_TOKEN. It hits the GitHub API for
 * auth verification, so we skip it locally when unauthenticated.
 */

import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const SERVER = resolve(import.meta.dir, 'server.ts');

type RpcResponse = {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
};

function runServer(env: Record<string, string>): Promise<{
  code: number | null;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const child = spawn('bun', ['run', SERVER], {
      env: { PATH: process.env['PATH'] ?? '', ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c: string) => {
      stderr += c;
    });
    child.on('exit', (code) => {
      resolve({ code, stderr });
    });
    setTimeout(() => {
      child.kill('SIGKILL');
    }, 5_000);
    child.stdin.end();
  });
}

describe('server e2e — startup path', () => {
  test('exits non-zero when GITHUB_TOKEN is missing', async () => {
    const r = await runServer({});
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('GITHUB_TOKEN');
  });
});

const TOKEN = process.env['GITHUB_TOKEN'];

describe.skipIf(TOKEN === undefined || TOKEN === '')(
  'server e2e — live (requires GITHUB_TOKEN)',
  () => {
    test('initialize + tools/list returns the expected tools', async () => {
      const child = spawn('bun', ['run', SERVER], {
        env: { ...process.env, LOG_LEVEL: 'error' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const responses = new Map<number, RpcResponse>();
      let buf = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        buf += chunk;
        let nl = buf.indexOf('\n');
        while (nl !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line.length > 0) {
            try {
              const parsed = JSON.parse(line) as RpcResponse;
              if (typeof parsed.id === 'number') responses.set(parsed.id, parsed);
            } catch {
              // ignore non-JSON lines
            }
          }
          nl = buf.indexOf('\n');
        }
      });

      const send = (id: number, method: string, params: unknown): void => {
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      };

      const await_ = (id: number, timeoutMs = 8_000): Promise<RpcResponse> =>
        new Promise((resolveFn, rejectFn) => {
          const start = Date.now();
          const tick = (): void => {
            const r = responses.get(id);
            if (r !== undefined) {
              resolveFn(r);
              return;
            }
            if (Date.now() - start > timeoutMs) {
              rejectFn(new Error(`timeout id=${id}`));
              return;
            }
            setTimeout(tick, 25);
          };
          tick();
        });

      try {
        send(1, 'initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'e2e', version: '0.0.1' },
        });
        const init = await await_(1);
        expect(init.error).toBeUndefined();

        child.stdin.write(
          `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
        );

        send(2, 'tools/list', {});
        const list = await await_(2);
        expect(list.error).toBeUndefined();
        const tools = (list.result as { tools: Array<{ name: string }> }).tools;
        const names = tools.map((t) => t.name);
        expect(names).toContain('ping');
        expect(names).toContain('get_repo_info');
      } finally {
        child.stdin.end();
        child.kill('SIGTERM');
      }
    }, 20_000);
  },
);
