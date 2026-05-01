import { Octokit } from 'octokit';
import type { Env } from '../config/env.ts';
import type { Logger } from '../lib/logging/logger.ts';
import { logRateLimit, parseRateLimit } from './rate-limit.ts';

export type GitHubClient = Octokit;

export interface GitHubClientDeps {
  readonly env: Pick<Env, 'GITHUB_TOKEN'>;
  readonly logger?: Logger;
}

export function createGitHubClient(deps: GitHubClientDeps): GitHubClient {
  const client = new Octokit({
    auth: deps.env.GITHUB_TOKEN,
    userAgent: 'context-bridge/0.0.1',
  });

  const log = deps.logger;
  if (log !== undefined) {
    client.hook.after('request', (response) => {
      const headers = response.headers as Record<string, string | string[] | undefined> | undefined;
      const state = parseRateLimit(headers);
      if (state !== null) logRateLimit(log, state);
    });
    client.hook.error('request', (error) => {
      const headers = (error as { response?: { headers?: Record<string, string> } })?.response
        ?.headers;
      const state = parseRateLimit(headers);
      if (state !== null) logRateLimit(log, state);
      throw error;
    });
  }

  return client;
}
