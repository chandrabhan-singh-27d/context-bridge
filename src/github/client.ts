import { Octokit } from 'octokit';
import type { Env } from '../config/env.ts';

export type GitHubClient = Octokit;

export function createGitHubClient(env: Pick<Env, 'GITHUB_TOKEN'>): GitHubClient {
  return new Octokit({
    auth: env.GITHUB_TOKEN,
    userAgent: 'context-bridge/0.0.1',
  });
}
