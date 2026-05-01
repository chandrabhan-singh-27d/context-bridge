import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadEnv } from './config/env.ts';
import { verifyAuth } from './github/auth.ts';
import { createGitHubClient } from './github/client.ts';
import { formatAppError } from './lib/errors.ts';
import { createLogger } from './lib/logging/logger.ts';
import { buildServer } from './mcp/server.ts';

async function main(): Promise<void> {
  const envR = loadEnv();
  if (!envR.ok) {
    process.stderr.write(`context-bridge: ${formatAppError(envR.error)}\n`);
    process.exit(1);
  }
  const env = envR.value;
  const log = createLogger({ level: env.LOG_LEVEL, context: { service: 'context-bridge' } });

  const github = createGitHubClient(env);
  const auth = await verifyAuth(github);
  if (!auth.ok) {
    log.error('github auth failed', { error: formatAppError(auth.error) });
    process.exit(1);
  }
  log.info('github authenticated', { login: auth.value.login });

  const server = buildServer({ github });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('mcp stdio transport connected');
}

main().catch((e: unknown) => {
  process.stderr.write(`context-bridge: fatal startup error ${String(e)}\n`);
  process.exit(1);
});
