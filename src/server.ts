import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildCache } from './cache/build-cache.ts';
import { loadEnv } from './config/env.ts';
import { verifyAuth } from './github/auth.ts';
import { createGitHubClient } from './github/client.ts';
import type { RepoCoords } from './github/schemas.ts';
import { formatAppError } from './lib/errors.ts';
import { createLogger } from './lib/logging/logger.ts';
import { buildServer } from './mcp/server.ts';

function parseDefaultRepo(slug: string | undefined): RepoCoords | null {
  if (slug === undefined) return null;
  const trimmed = slug.trim();
  const parts = trimmed.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (owner === undefined || owner === '' || repo === undefined || repo === '') return null;
  return { owner, repo };
}

async function main(): Promise<void> {
  const envR = loadEnv();
  if (!envR.ok) {
    process.stderr.write(`context-bridge: ${formatAppError(envR.error)}\n`);
    process.exit(1);
  }
  const env = envR.value;
  const log = createLogger({ level: env.LOG_LEVEL, context: { service: 'context-bridge' } });

  const github = createGitHubClient({ env, logger: log });
  const auth = await verifyAuth(github);
  if (!auth.ok) {
    log.error('github auth failed', { error: formatAppError(auth.error) });
    process.exit(1);
  }
  log.info('github authenticated', { login: auth.value.login });

  const defaultRepo = parseDefaultRepo(env.DEFAULT_REPO);
  if (defaultRepo === null) {
    log.warn(
      'DEFAULT_REPO not set — repo:// resources (readme/structure/recent-activity) disabled',
    );
  }

  const cacheR = buildCache({ defaultTtlMs: env.CACHE_TTL_SECONDS * 1000 });
  if (!cacheR.ok) {
    log.error('cache init failed — running without cache', { error: formatAppError(cacheR.error) });
  }
  const cache = cacheR.ok ? cacheR.value : null;

  const server = buildServer({ github, defaultRepo, cache });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('mcp stdio transport connected');
}

main().catch((e: unknown) => {
  process.stderr.write(`context-bridge: fatal startup error ${String(e)}\n`);
  process.exit(1);
});
