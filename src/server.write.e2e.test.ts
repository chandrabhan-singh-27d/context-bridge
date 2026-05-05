/**
 * Write-surface E2E. Token + sandbox-gated, opt-in.
 *
 * Drives the real write-tool handlers against a real GitHub sandbox repo:
 *   create_branch → commit_files → open_pr → comment_on_pr → label_issue.
 *
 * Gate (skip unless both set):
 *   - GITHUB_TOKEN  must have write-capable scopes for E2E_WRITE_REPO
 *   - E2E_WRITE_REPO  in "owner/repo" form
 *
 * Cleanup (default on; disable with E2E_WRITE_NO_CLEANUP=true):
 *   - close the PR via Octokit directly (the tool surface intentionally
 *     does not expose close — that is HITL-only — but tests are infra,
 *     not user-facing tool calls, so direct API access is fine here)
 *   - delete the temporary head branch
 *
 * Never run against a production repo. Use a dedicated sandbox.
 */

import { describe, expect, test } from 'bun:test';
import { Octokit } from 'octokit';
import { commentOnPrHandler } from './mcp/tools/comment-on-pr.ts';
import { commitFilesHandler } from './mcp/tools/commit-files.ts';
import { createBranchHandler } from './mcp/tools/create-branch.ts';
import { labelIssueHandler } from './mcp/tools/label-issue.ts';
import { openPrHandler } from './mcp/tools/open-pr.ts';

const TOKEN = process.env['GITHUB_TOKEN'];
const REPO_SLUG = process.env['E2E_WRITE_REPO'];
const SKIP_CLEANUP = process.env['E2E_WRITE_NO_CLEANUP'] === 'true';

function parseSlug(slug: string | undefined): { owner: string; repo: string } | null {
  if (slug === undefined || slug === '') return null;
  const parts = slug.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (owner === undefined || owner === '' || repo === undefined || repo === '') return null;
  return { owner, repo };
}

const target = parseSlug(REPO_SLUG);

describe.skipIf(TOKEN === undefined || TOKEN === '' || target === null)(
  'write-surface e2e — live (requires GITHUB_TOKEN + E2E_WRITE_REPO)',
  () => {
    test('create_branch → commit_files → open_pr → comment_on_pr → label_issue round-trip', async () => {
      const { owner, repo } = target as { owner: string; repo: string };
      const client = new Octokit({ auth: TOKEN, userAgent: 'context-bridge-e2e/0.0.1' });
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const branchName = `e2e/write-${stamp}`;
      let prNumber: number | undefined;

      try {
        const branch = await createBranchHandler(client, { owner, repo, name: branchName });
        expect(branch.ok).toBe(true);
        if (!branch.ok) throw new Error(`create_branch: ${branch.error.message}`);
        expect(branch.value.ref).toBe(`refs/heads/${branchName}`);

        const committed = await commitFilesHandler(client, {
          owner,
          repo,
          branch: branchName,
          message: `e2e write-surface marker ${stamp}`,
          files: [
            {
              path: `.context-bridge-e2e/${stamp}.md`,
              content: `e2e marker file. created at ${new Date().toISOString()}.\n`,
            },
          ],
        });
        expect(committed.ok).toBe(true);
        if (!committed.ok) throw new Error(`commit_files: ${committed.error.message}`);
        expect(committed.value.commitSha).toMatch(/^[0-9a-f]{40}$/);

        const repoMeta = await client.rest.repos.get({ owner, repo });
        const opened = await openPrHandler(client, {
          owner,
          repo,
          head: branchName,
          base: repoMeta.data.default_branch,
          title: `e2e write-surface ${stamp}`,
          body: 'Automated write-surface E2E. Safe to close — created by `bun run test:e2e:write`.',
          draft: true,
        });
        expect(opened.ok).toBe(true);
        if (!opened.ok) throw new Error(`open_pr: ${opened.error.message}`);
        prNumber = opened.value.number;
        expect(opened.value.draft).toBe(true);

        const commented = await commentOnPrHandler(client, {
          owner,
          repo,
          number: prNumber,
          body: 'e2e: comment_on_pr round-trip',
        });
        expect(commented.ok).toBe(true);
        if (!commented.ok) throw new Error(`comment_on_pr: ${commented.error.message}`);

        const labelled = await labelIssueHandler(client, {
          owner,
          repo,
          number: prNumber,
          labels: ['e2e-test'],
        });
        expect(labelled.ok).toBe(true);
        if (!labelled.ok) throw new Error(`label_issue: ${labelled.error.message}`);
        expect(labelled.value.applied).toContain('e2e-test');
      } finally {
        if (!SKIP_CLEANUP) {
          if (prNumber !== undefined) {
            await client.rest.pulls
              .update({ owner, repo, pull_number: prNumber, state: 'closed' })
              .catch(() => undefined);
          }
          await client.rest.git
            .deleteRef({ owner, repo, ref: `heads/${branchName}` })
            .catch(() => undefined);
        }
      }
    }, 60_000);
  },
);
