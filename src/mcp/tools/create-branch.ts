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

async function resolveSourceSha(
  client: GitHubClient,
  owner: string,
  repo: string,
  fromRef: string | undefined,
): Promise<Result<string, AppError>> {
  if (fromRef !== undefined) {
    const endpoint = `GET /repos/${owner}/${repo}/git/ref/heads/${fromRef}`;
    const fetchedRef = await tryCatch(
      () => client.rest.git.getRef({ owner, repo, ref: `heads/${fromRef}` }),
      (cause) => mapGitHubError(cause, endpoint),
    );
    if (!fetchedRef.ok) return fetchedRef;
    return ok(fetchedRef.value.data.object.sha);
  }
  const repoEndpoint = `GET /repos/${owner}/${repo}`;
  const repoMeta = await tryCatch(
    () => client.rest.repos.get({ owner, repo }),
    (cause) => mapGitHubError(cause, repoEndpoint),
  );
  if (!repoMeta.ok) return repoMeta;
  const defaultBranch = repoMeta.value.data.default_branch;
  const defaultRefEndpoint = `GET /repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`;
  const defaultRef = await tryCatch(
    () => client.rest.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` }),
    (cause) => mapGitHubError(cause, defaultRefEndpoint),
  );
  if (!defaultRef.ok) return defaultRef;
  return ok(defaultRef.value.data.object.sha);
}

export async function createBranchHandler(
  client: GitHubClient,
  input: CreateBranchInput,
): Promise<Result<CreateBranchResult, AppError>> {
  if (input.fromRef !== undefined && input.fromRef === input.name) {
    return err(AppError.validation('name', 'name and fromRef must differ'));
  }

  const sourceSha = await resolveSourceSha(client, input.owner, input.repo, input.fromRef);
  if (!sourceSha.ok) return sourceSha;

  const endpoint = `POST /repos/${input.owner}/${input.repo}/git/refs`;
  const created = await tryCatch(
    () =>
      client.rest.git.createRef({
        owner: input.owner,
        repo: input.repo,
        ref: `refs/heads/${input.name}`,
        sha: sourceSha.value,
      }),
    (cause) => mapGitHubError(cause, endpoint),
  );
  if (!created.ok) return created;
  return ok({ ref: created.value.data.ref, sha: created.value.data.object.sha });
}

export function registerCreateBranch(server: McpServer, client: GitHubClient): void {
  server.tool(
    'create_branch',
    'Create a new branch from `fromRef` (or default branch HEAD). Write surface — requires WRITES_ENABLED.',
    createBranchInputSchema,
    async (args) => {
      const outcome = await createBranchHandler(client, args);
      if (!outcome.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(outcome.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(outcome.value, null, 2) }] };
    },
  );
}
