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
  const repoMeta = await tryCatch(
    () => client.rest.repos.get({ owner: input.owner, repo: input.repo }),
    (cause) => mapGitHubError(cause, repoEndpoint),
  );
  if (!repoMeta.ok) return repoMeta;
  if (repoMeta.value.data.default_branch === input.branch) {
    return err(
      AppError.validation('branch', 'refusing to commit to default branch (HITL-only target)'),
    );
  }

  const branchRefEndpoint = `GET /repos/${input.owner}/${input.repo}/git/ref/heads/${input.branch}`;
  const branchRef = await tryCatch(
    () =>
      client.rest.git.getRef({
        owner: input.owner,
        repo: input.repo,
        ref: `heads/${input.branch}`,
      }),
    (cause) => mapGitHubError(cause, branchRefEndpoint),
  );
  if (!branchRef.ok) return branchRef;
  const parentSha = branchRef.value.data.object.sha;

  const parentCommitEndpoint = `GET /repos/${input.owner}/${input.repo}/git/commits/${parentSha}`;
  const parentCommit = await tryCatch(
    () =>
      client.rest.git.getCommit({ owner: input.owner, repo: input.repo, commit_sha: parentSha }),
    (cause) => mapGitHubError(cause, parentCommitEndpoint),
  );
  if (!parentCommit.ok) return parentCommit;
  const baseTreeSha = parentCommit.value.data.tree.sha;

  const uploadedBlobs: Array<{ path: string; sha: string }> = [];
  for (const file of input.files) {
    const blobEndpoint = `POST /repos/${input.owner}/${input.repo}/git/blobs`;
    const uploaded = await tryCatch(
      () =>
        client.rest.git.createBlob({
          owner: input.owner,
          repo: input.repo,
          content: Buffer.from(file.content, 'utf8').toString('base64'),
          encoding: 'base64',
        }),
      (cause) => mapGitHubError(cause, blobEndpoint),
    );
    if (!uploaded.ok) return uploaded;
    uploadedBlobs.push({ path: file.path, sha: uploaded.value.data.sha });
  }

  const treeEndpoint = `POST /repos/${input.owner}/${input.repo}/git/trees`;
  const newTree = await tryCatch(
    () =>
      client.rest.git.createTree({
        owner: input.owner,
        repo: input.repo,
        base_tree: baseTreeSha,
        tree: uploadedBlobs.map((blob) => ({
          path: blob.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha,
        })),
      }),
    (cause) => mapGitHubError(cause, treeEndpoint),
  );
  if (!newTree.ok) return newTree;

  const commitEndpoint = `POST /repos/${input.owner}/${input.repo}/git/commits`;
  const newCommit = await tryCatch(
    () =>
      client.rest.git.createCommit({
        owner: input.owner,
        repo: input.repo,
        message: input.message,
        tree: newTree.value.data.sha,
        parents: [parentSha],
      }),
    (cause) => mapGitHubError(cause, commitEndpoint),
  );
  if (!newCommit.ok) return newCommit;

  const updateEndpoint = `PATCH /repos/${input.owner}/${input.repo}/git/refs/heads/${input.branch}`;
  const advanced = await tryCatch(
    () =>
      client.rest.git.updateRef({
        owner: input.owner,
        repo: input.repo,
        ref: `heads/${input.branch}`,
        sha: newCommit.value.data.sha,
      }),
    (cause) => mapGitHubError(cause, updateEndpoint),
  );
  if (!advanced.ok) return advanced;

  return ok({
    commitSha: newCommit.value.data.sha,
    htmlUrl: newCommit.value.data.html_url,
  });
}

export function registerCommitFiles(server: McpServer, client: GitHubClient): void {
  server.tool(
    'commit_files',
    'Atomically commit one or more files to a non-default branch via the Git Data API. Write surface — requires WRITES_ENABLED.',
    commitFilesInputSchema,
    async (args) => {
      const outcome = await commitFilesHandler(client, args);
      if (!outcome.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(outcome.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(outcome.value, null, 2) }] };
    },
  );
}
