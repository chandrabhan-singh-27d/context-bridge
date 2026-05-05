import { z } from 'zod';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { issueNumber, repoCoordsSchema } from '../../github/schemas.ts';
import { AppError } from '../../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../../lib/result.ts';

export const MAX_RELEVANT_PATHS = 10;
export const MAX_FILE_BYTES = 100_000;
export const MAX_TOTAL_FILE_BYTES = 400_000;
export const MAX_PROPOSED_FILES = 20;
export const MAX_COMMENTS = 20;

const relativePath = z
  .string()
  .min(1)
  .max(512)
  .refine((p) => !p.startsWith('/') && !p.includes('..'), {
    message: 'must be a relative path without ".." segments',
  });

export const proposeFixInputSchema = {
  ...repoCoordsSchema,
  number: issueNumber,
  relevantPaths: z.array(relativePath).max(MAX_RELEVANT_PATHS).optional(),
  baseBranch: z.string().min(1).max(255).optional(),
  draft: z.boolean().optional(),
};

export const proposalSchema = z.object({
  branchName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9._/-]+$/, 'branchName must be kebab/slash/underscore only'),
  commitMessage: z.string().min(1).max(72_000),
  files: z
    .array(z.object({ path: z.string().min(1).max(512), content: z.string().max(5_000_000) }))
    .max(MAX_PROPOSED_FILES),
  prTitle: z.string().min(1).max(256),
  prBody: z.string().min(1).max(65_536),
});

export type Proposal = z.infer<typeof proposalSchema>;

export async function fetchRelevantFiles(
  client: GitHubClient,
  owner: string,
  repo: string,
  paths: ReadonlyArray<string>,
): Promise<Result<ReadonlyArray<{ path: string; content: string }>, AppError>> {
  const fetched: Array<{ path: string; content: string }> = [];
  let total = 0;
  for (const path of paths) {
    const endpoint = `GET /repos/${owner}/${repo}/contents/${path}`;
    const response = await tryCatch(
      () => client.rest.repos.getContent({ owner, repo, path }),
      (cause) => mapGitHubError(cause, endpoint),
    );
    if (!response.ok) return response;
    const data = response.value.data;
    if (Array.isArray(data) || data.type !== 'file' || typeof data.content !== 'string') {
      return err(AppError.validation(path, 'relevantPaths entry is not a regular file'));
    }
    const decoded = Buffer.from(data.content, 'base64').toString('utf8');
    if (decoded.length > MAX_FILE_BYTES) {
      return err(
        AppError.validation(path, `file exceeds ${MAX_FILE_BYTES}-byte cap for proposal context`),
      );
    }
    total += decoded.length;
    if (total > MAX_TOTAL_FILE_BYTES) {
      return err(
        AppError.validation(
          'relevantPaths',
          `combined file context exceeds ${MAX_TOTAL_FILE_BYTES} bytes`,
        ),
      );
    }
    fetched.push({ path, content: decoded });
  }
  return ok(fetched);
}

export function ensureClosesMarker(prBody: string, issueNum: number): string {
  return prBody.includes(`Closes #${issueNum}`)
    ? prBody
    : `${prBody.trim()}\n\nCloses #${issueNum}\n`;
}
