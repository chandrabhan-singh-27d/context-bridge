/**
 * Stable cache key builder. Keys must be deterministic across runs and
 * order-independent for params, so two equivalent requests share a hit.
 *
 * Format: `endpoint|owner/repo|<k=v sorted by k joined by &>`
 *
 * Endpoint should be the GitHub REST path (e.g. "GET /repos/{owner}/{repo}").
 * Params are stringified with `JSON.stringify`. Undefined values are dropped
 * so optional filters don't fragment the namespace.
 */

export interface CacheKeyParts {
  readonly endpoint: string;
  readonly owner: string;
  readonly repo: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export function buildCacheKey(parts: CacheKeyParts): string {
  const { endpoint, owner, repo, params } = parts;
  const repoPart = `${owner}/${repo}`;
  if (params === undefined) return `${endpoint}|${repoPart}|`;
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) return `${endpoint}|${repoPart}|`;
  const paramsPart = entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('&');
  return `${endpoint}|${repoPart}|${paramsPart}`;
}
