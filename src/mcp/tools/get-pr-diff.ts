import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { issueNumber, repoCoordsSchema } from '../../github/schemas.ts';
import type { AppError } from '../../lib/errors.ts';
import { AppError as AppErr, formatAppError } from '../../lib/errors.ts';
import { type Result, err, ok, tryCatch } from '../../lib/result.ts';

const MAX_DIFF_BYTES = 1_048_576; // 1 MiB hard cap to keep MCP responses tractable

export const getPrDiffInputSchema = {
  ...repoCoordsSchema,
  number: issueNumber,
  maxBytes: z.number().int().min(1024).max(MAX_DIFF_BYTES).default(MAX_DIFF_BYTES),
};

export interface GetPrDiffInput {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly maxBytes: number;
}

export interface PrDiffResult {
  readonly diff: string;
  readonly truncated: boolean;
  readonly bytes: number;
}

export async function getPrDiffHandler(
  client: GitHubClient,
  input: GetPrDiffInput,
): Promise<Result<PrDiffResult, AppError>> {
  const endpoint = `GET /repos/${input.owner}/${input.repo}/pulls/${input.number} (diff)`;
  const r = await tryCatch(
    () =>
      client.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner: input.owner,
        repo: input.repo,
        pull_number: input.number,
        headers: { accept: 'application/vnd.github.v3.diff' },
      }),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!r.ok) return r;

  const raw: unknown = r.value.data;
  if (typeof raw !== 'string') {
    return err(AppErr.internal('expected diff text from GitHub, got non-string body'));
  }
  const bytes = Buffer.byteLength(raw, 'utf8');
  if (bytes <= input.maxBytes) {
    return ok({ diff: raw, truncated: false, bytes });
  }
  // Truncate at byte cap, then extend to the next newline so the diff stays parseable.
  let cut = input.maxBytes;
  const nl = raw.indexOf('\n', cut);
  if (nl !== -1 && nl - cut < 4096) cut = nl + 1;
  return ok({ diff: raw.slice(0, cut), truncated: true, bytes });
}

export function registerGetPrDiff(server: McpServer, client: GitHubClient): void {
  server.tool(
    'get_pr_diff',
    'Fetch the unified diff for a pull request. Truncates at maxBytes (default 1 MiB) at the next newline boundary; sets truncated=true when capped. Read-only.',
    getPrDiffInputSchema,
    async (args) => {
      const r = await getPrDiffHandler(client, args);
      if (!r.ok) {
        return {
          isError: true,
          content: [{ type: 'text', text: formatAppError(r.error) }],
        };
      }
      const header = r.value.truncated
        ? `# Diff truncated at ${args.maxBytes} bytes (full size: ${r.value.bytes} bytes)\n`
        : '';
      return {
        content: [{ type: 'text', text: header + r.value.diff }],
      };
    },
  );
}
