import { resolve } from 'node:path';
import { formatAppError } from '../../src/lib/errors.ts';
import { createLogger } from '../../src/lib/logging/logger.ts';
import { loadCompanionEnv } from './env.ts';
import { createMcpBridge } from './mcp-bridge.ts';
import { createApp } from './routes.ts';
import { createTokenBucket } from './token-bucket.ts';

async function main(): Promise<void> {
  const envR = loadCompanionEnv();
  if (!envR.ok) {
    process.stderr.write(`companion-ui: ${formatAppError(envR.error)}\n`);
    process.exit(1);
  }
  const env = envR.value;
  const log = createLogger({
    level: env.LOG_LEVEL,
    context: { service: 'companion-ui' },
  });

  const bridge = createMcpBridge({
    command: env.COMPANION_MCP_COMMAND,
    args: env.COMPANION_MCP_ARGS.split(/\s+/).filter((s) => s.length > 0),
    onStderr: (line) => {
      if (line.length > 0) log.debug('mcp.stderr', { line });
    },
  });

  const bucket = createTokenBucket({
    capacity: env.COMPANION_RATE_CAPACITY,
    refillPerSec: env.COMPANION_RATE_REFILL_PER_SEC,
  });

  const webRoot = resolve(import.meta.dir, '../web');
  const app = createApp({ bridge, bucket, logger: log, webRoot });

  const init = await bridge.initialize();
  if (!init.ok) {
    log.error('mcp bridge init failed', { error: formatAppError(init.error) });
    process.exit(1);
  }
  log.info('mcp bridge initialized');

  const server = Bun.serve({
    hostname: env.COMPANION_HOST,
    port: env.COMPANION_PORT,
    fetch: app.fetch,
  });
  log.info('companion-ui listening', { url: `http://${server.hostname}:${server.port}` });

  const shutdown = async (signal: string): Promise<void> => {
    log.info('shutdown', { signal });
    server.stop();
    await bridge.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e: unknown) => {
  process.stderr.write(`companion-ui: fatal startup error ${String(e)}\n`);
  process.exit(1);
});
