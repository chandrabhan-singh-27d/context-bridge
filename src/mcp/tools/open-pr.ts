import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { AppError, formatAppError } from '../../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../../lib/result.ts';
import { branchName, prBody, prTitle, repoCoords } from './write-schemas.ts';

export const openPrInputSchema = {
  ...repoCoords,
  head: branchName,
  base: branchName,
  title: prTitle,
  body: prBody,
  draft: z.boolean().optional(),
};

export interface OpenPrInput {
  readonly owner: string;
  readonly repo: string;
  readonly head: string;
  readonly base: string;
  readonly title: string;
  readonly body: string;
  readonly draft?: boolean | undefined;
}

export interface OpenPrResult {
  readonly number: number;
  readonly htmlUrl: string;
  readonly draft: boolean;
}

export async function openPrHandler(
  client: GitHubClient,
  input: OpenPrInput,
): Promise<Result<OpenPrResult, AppError>> {
  if (input.head === input.base) {
    return err(AppError.validation('head', 'head and base must differ'));
  }

  const refEndpoint = `GET /repos/${input.owner}/${input.repo}/git/ref/heads/${input.head}`;
  const headRef = await tryCatch(
    () =>
      client.rest.git.getRef({
        owner: input.owner,
        repo: input.repo,
        ref: `heads/${input.head}`,
      }),
    (cause) => mapGitHubError(cause, refEndpoint),
  );
  if (!headRef.ok) return headRef;

  const endpoint = `POST /repos/${input.owner}/${input.repo}/pulls`;
  const opened = await tryCatch(
    () =>
      client.rest.pulls.create({
        owner: input.owner,
        repo: input.repo,
        head: input.head,
        base: input.base,
        title: input.title,
        body: input.body,
        ...(input.draft !== undefined ? { draft: input.draft } : {}),
      }),
    (cause) => mapGitHubError(cause, endpoint),
  );
  if (!opened.ok) return opened;
  return ok({
    number: opened.value.data.number,
    htmlUrl: opened.value.data.html_url,
    draft: opened.value.data.draft ?? false,
  });
}

export function registerOpenPr(server: McpServer, client: GitHubClient): void {
  server.tool(
    'open_pr',
    'Open a pull request from `head` to `base`. `body` may include "Closes #N" markers. Write surface — requires WRITES_ENABLED.',
    openPrInputSchema,
    async (args) => {
      const outcome = await openPrHandler(client, args);
      if (!outcome.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(outcome.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(outcome.value, null, 2) }] };
    },
  );
}
