/**
 * Per-endpoint TTL constants for the request cache. Tunable based on how
 * fast the underlying GitHub data churns vs. how stale the assistant can
 * tolerate.
 *
 * Search endpoints + CI runs get short TTLs (results move). Repo metadata,
 * PR diffs, and commit history get longer TTLs (immutable or slow-moving).
 */

export const TTL_REPO_INFO_MS = 10 * 60 * 1_000;
export const TTL_PULL_REQUEST_MS = 60 * 1_000;
export const TTL_PR_DIFF_MS = 5 * 60 * 1_000;
export const TTL_REVIEW_COMMENTS_MS = 60 * 1_000;
export const TTL_SEARCH_ISSUES_MS = 30 * 1_000;
export const TTL_CI_STATUS_MS = 30 * 1_000;
export const TTL_COMMIT_HISTORY_MS = 2 * 60 * 1_000;
export const TTL_SEARCH_CODE_MS = 60 * 1_000;
