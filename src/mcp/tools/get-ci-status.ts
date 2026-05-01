import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { repoCoordsSchema } from '../../github/schemas.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { type Result, ok, tryCatch } from '../../lib/result.ts';

export const getCiStatusInputSchema = {
  ...repoCoordsSchema,
  branch: z.string().min(1).max(255).optional(),
  limit: z.number().int().min(1).max(50).default(10),
};

export interface GetCiStatusInput {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string | undefined;
  readonly limit: number;
}

export interface WorkflowRunSummary {
  readonly id: number;
  readonly name: string | null;
  readonly workflowId: number;
  readonly headBranch: string | null;
  readonly headSha: string;
  readonly event: string;
  readonly status: string | null;
  readonly conclusion: string | null;
  readonly runNumber: number;
  readonly htmlUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CiStatusResult {
  readonly totalCount: number;
  readonly runs: ReadonlyArray<WorkflowRunSummary>;
}

export async function getCiStatusHandler(
  client: GitHubClient,
  input: GetCiStatusInput,
): Promise<Result<CiStatusResult, AppError>> {
  const endpoint = `GET /repos/${input.owner}/${input.repo}/actions/runs`;
  const params: {
    owner: string;
    repo: string;
    per_page: number;
    branch?: string;
  } = {
    owner: input.owner,
    repo: input.repo,
    per_page: input.limit,
  };
  if (input.branch !== undefined) params.branch = input.branch;
  const r = await tryCatch(
    () => client.rest.actions.listWorkflowRunsForRepo(params),
    (e) => mapGitHubError(e, endpoint),
  );
  if (!r.ok) return r;
  const d = r.value.data;
  return ok({
    totalCount: d.total_count,
    runs: d.workflow_runs.map((w) => ({
      id: w.id,
      name: w.name ?? null,
      workflowId: w.workflow_id,
      headBranch: w.head_branch ?? null,
      headSha: w.head_sha,
      event: w.event,
      status: w.status ?? null,
      conclusion: w.conclusion ?? null,
      runNumber: w.run_number,
      htmlUrl: w.html_url,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
    })),
  });
}

export function registerGetCiStatus(server: McpServer, client: GitHubClient): void {
  server.tool(
    'get_ci_status',
    'List recent GitHub Actions workflow runs for a repository. Optional branch filter (branch name only — not SHA or tag). Returns status, conclusion, head SHA, run number, URL. Read-only.',
    getCiStatusInputSchema,
    async (args) => {
      const r = await getCiStatusHandler(client, args);
      if (!r.ok) {
        return {
          isError: true,
          content: [{ type: 'text', text: formatAppError(r.error) }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(r.value, null, 2) }],
      };
    },
  );
}
