import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { AppError, formatAppError } from '../../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../../lib/result.ts';
import { branchName, commitMessage, fileEntry, repoCoords } from './write-schemas.ts';

export const commitFilesInputSchema = {
  ...repoCoords,
  branch: branchName,
  message: commitMessage,
  files: z.array(fileEntry).min(1).max(100),
};

export interface CommitFilesInput {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly message: string;
  readonly files: ReadonlyArray<{ readonly path: string; readonly content: string }>;
}

export interface CommitFilesResult {
  readonly commitSha: string;
  readonly htmlUrl: string;
}

export async function commitFilesHandler(
  client: GitHubClient,
  input: CommitFilesInput,
): Promise<Result<CommitFilesResult, AppError>> {
  if (input.files.length === 0) {
    return err(AppError.validation('files', 'must contain at least one file'));
  }

  const repoEndpoint = `GET /repos/${input.owner}/${input.repo}`;
  const repoRes = await tryCatch(
    () => client.rest.repos.get({ owner: input.owner, repo: input.repo }),
    (e) => mapGitHubError(e, repoEndpoint),
  );
  if (!repoRes.ok) return repoRes;
  if (repoRes.value.data.default_branch === input.branch) {
    return err(
      AppError.validation('branch', 'refusing to commit to default branch (HITL-only target)'),
    );
  }

  const refEndpoint = `GET /repos/${input.owner}/${input.repo}/git/ref/heads/${input.branch}`;
  const refRes = await tryCatch(
    () =>
      client.rest.git.getRef({
        owner: input.owner,
        repo: input.repo,
        ref: `heads/${input.branch}`,
      }),
    (e) => mapGitHubError(e, refEndpoint),
  );
  if (!refRes.ok) return refRes;
  const parentSha = refRes.value.data.object.sha;

  const parentCommitEndpoint = `GET /repos/${input.owner}/${input.repo}/git/commits/${parentSha}`;
  const parentCommit = await tryCatch(
    () =>
      client.rest.git.getCommit({ owner: input.owner, repo: input.repo, commit_sha: parentSha }),
    (e) => mapGitHubError(e, parentCommitEndpoint),
  );
  if (!parentCommit.ok) return parentCommit;
  const baseTreeSha = parentCommit.value.data.tree.sha;

  const blobs: Array<{ path: string; sha: string }> = [];
  for (const f of input.files) {
    const blobEndpoint = `POST /repos/${input.owner}/${input.repo}/git/blobs`;
    const blob = await tryCatch(
      () =>
        client.rest.git.createBlob({
          owner: input.owner,
          repo: input.repo,
          content: Buffer.from(f.content, 'utf8').toString('base64'),
          encoding: 'base64',
        }),
      (e) => mapGitHubError(e, blobEndpoint),
    );
    if (!blob.ok) return blob;
    blobs.push({ path: f.path, sha: blob.value.data.sha });
  }

  const treeEndpoint = `POST /repos/${input.owner}/${input.repo}/git/trees`;
  const tree = await tryCatch(
    () =>
      client.rest.git.createTree({
        owner: input.owner,
        repo: input.repo,
        base_tree: baseTreeSha,
        tree: blobs.map((b) => ({
          path: b.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: b.sha,
        })),
      }),
    (e) => mapGitHubError(e, treeEndpoint),
  );
  if (!tree.ok) return tree;

  const commitEndpoint = `POST /repos/${input.owner}/${input.repo}/git/commits`;
  const commit = await tryCatch(
    () =>
      client.rest.git.createCommit({
        owner: input.owner,
        repo: input.repo,
        message: input.message,
        tree: tree.value.data.sha,
        parents: [parentSha],
      }),
    (e) => mapGitHubError(e, commitEndpoint),
  );
  if (!commit.ok) return commit;

  const updateEndpoint = `PATCH /repos/${input.owner}/${input.repo}/git/refs/heads/${input.branch}`;
  const updated = await tryCatch(
    () =>
      client.rest.git.updateRef({
        owner: input.owner,
        repo: input.repo,
        ref: `heads/${input.branch}`,
        sha: commit.value.data.sha,
      }),
    (e) => mapGitHubError(e, updateEndpoint),
  );
  if (!updated.ok) return updated;

  return ok({
    commitSha: commit.value.data.sha,
    htmlUrl: commit.value.data.html_url,
  });
}

export function registerCommitFiles(server: McpServer, client: GitHubClient): void {
  server.tool(
    'commit_files',
    'Atomically commit one or more files to a non-default branch via the Git Data API. Write surface — requires WRITES_ENABLED.',
    commitFilesInputSchema,
    async (args) => {
      const r = await commitFilesHandler(client, args);
      if (!r.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(r.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(r.value, null, 2) }] };
    },
  );
}
