import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import type { AppError } from '../../lib/errors.ts';
import { formatAppError } from '../../lib/errors.ts';
import { ok, type Result, tryCatch } from '../../lib/result.ts';
import { issueCoords, labelList } from './write-schemas.ts';

export const labelIssueInputSchema = {
  ...issueCoords,
  labels: labelList,
};

export interface LabelIssueInput {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly labels: ReadonlyArray<string>;
}

export interface LabelIssueResult {
  readonly applied: ReadonlyArray<string>;
}

export async function labelIssueHandler(
  client: GitHubClient,
  input: LabelIssueInput,
): Promise<Result<LabelIssueResult, AppError>> {
  const endpoint = `POST /repos/${input.owner}/${input.repo}/issues/${input.number}/labels`;
  const labelled = await tryCatch(
    () =>
      client.rest.issues.addLabels({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.number,
        labels: [...input.labels],
      }),
    (cause) => mapGitHubError(cause, endpoint),
  );
  if (!labelled.ok) return labelled;
  return ok({ applied: labelled.value.data.map((label) => label.name) });
}

export function registerLabelIssue(server: McpServer, client: GitHubClient): void {
  server.tool(
    'label_issue',
    'Add labels to a GitHub issue or PR. Existing labels are preserved. Write surface — requires WRITES_ENABLED.',
    labelIssueInputSchema,
    async (args) => {
      const outcome = await labelIssueHandler(client, args);
      if (!outcome.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(outcome.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(outcome.value, null, 2) }] };
    },
  );
}
