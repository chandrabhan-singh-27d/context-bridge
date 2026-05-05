import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { AppError, formatAppError } from '../../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../../lib/result.ts';
import { branchName, repoCoords } from './write-schemas.ts';

export const createBranchInputSchema = {
  ...repoCoords,
  name: branchName,
  fromRef: branchName.optional(),
};

export interface CreateBranchInput {
  readonly owner: string;
  readonly repo: string;
  readonly name: string;
  readonly fromRef?: string | undefined;
}

export interface CreateBranchResult {
  readonly ref: string;
  readonly sha: string;
}

async function resolveSha(
  client: GitHubClient,
  owner: string,
  repo: string,
  fromRef: string | undefined,
): Promise<Result<string, AppError>> {
  if (fromRef !== undefined) {
    const endpoint = `GET /repos/${owner}/${repo}/git/ref/heads/${fromRef}`;
    const r = await tryCatch(
      () => client.rest.git.getRef({ owner, repo, ref: `heads/${fromRef}` }),
      (e) => mapGitHubError(e, endpoint),
    );
    if (!r.ok) return r;
    return ok(r.value.data.object.sha);
  }
  const endpoint = `GET /repos/${owner}/${repo}`;
  const meta = await tryCatch(
    () => client.rest.repos.get({ owner, repo }),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!meta.ok) return meta;
  const head = meta.value.data.default_branch;
  const refEndpoint = `GET /repos/${owner}/${repo}/git/ref/heads/${head}`;
  const refRes = await tryCatch(
    () => client.rest.git.getRef({ owner, repo, ref: `heads/${head}` }),
    (e) => mapGitHubError(e, refEndpoint),
  );
  if (!refRes.ok) return refRes;
  return ok(refRes.value.data.object.sha);
}

export async function createBranchHandler(
  client: GitHubClient,
  input: CreateBranchInput,
): Promise<Result<CreateBranchResult, AppError>> {
  if (input.fromRef !== undefined && input.fromRef === input.name) {
    return err(AppError.validation('name', 'name and fromRef must differ'));
  }

  const sha = await resolveSha(client, input.owner, input.repo, input.fromRef);
  if (!sha.ok) return sha;

  const endpoint = `POST /repos/${input.owner}/${input.repo}/git/refs`;
  const r = await tryCatch(
    () =>
      client.rest.git.createRef({
        owner: input.owner,
        repo: input.repo,
        ref: `refs/heads/${input.name}`,
        sha: sha.value,
      }),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!r.ok) return r;
  return ok({ ref: r.value.data.ref, sha: r.value.data.object.sha });
}

export function registerCreateBranch(server: McpServer, client: GitHubClient): void {
  server.tool(
    'create_branch',
    'Create a new branch from `fromRef` (or default branch HEAD). Write surface — requires WRITES_ENABLED.',
    createBranchInputSchema,
    async (args) => {
      const r = await createBranchHandler(client, args);
      if (!r.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(r.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(r.value, null, 2) }] };
    },
  );
}
