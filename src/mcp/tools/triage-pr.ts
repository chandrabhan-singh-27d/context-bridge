import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { issueNumber, repoCoordsSchema } from '../../github/schemas.ts';
import { type AppError, formatAppError } from '../../lib/errors.ts';
import { ok, type Result, tryCatch } from '../../lib/result.ts';
import { parseLlmJson } from '../../llm/parse.ts';
import { buildPrTriagePrompt } from '../../llm/prompts.ts';
import type { LlmProvider } from '../../llm/provider.ts';

const MAX_DIFF_BYTES = 200_000;

export const triagePrInputSchema = {
  ...repoCoordsSchema,
  number: issueNumber,
};

export interface TriagePrInput {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
}

const triageSchema = z.object({
  summary: z.string().min(1),
  riskAreas: z.array(z.string()),
  suggestedLabels: z.array(z.string()),
  reviewerNotes: z.array(z.string()),
});

export interface TriagePrResult {
  readonly summary: string;
  readonly riskAreas: ReadonlyArray<string>;
  readonly suggestedLabels: ReadonlyArray<string>;
  readonly reviewerNotes: ReadonlyArray<string>;
  readonly llmModel: string;
  readonly diffTruncated: boolean;
}

export async function triagePrHandler(
  client: GitHubClient,
  llm: LlmProvider,
  input: TriagePrInput,
): Promise<Result<TriagePrResult, AppError>> {
  const prEndpoint = `GET /repos/${input.owner}/${input.repo}/pulls/${input.number}`;
  const prFetched = await tryCatch(
    () =>
      client.rest.pulls.get({
        owner: input.owner,
        repo: input.repo,
        pull_number: input.number,
      }),
    (cause) => mapGitHubError(cause, prEndpoint),
  );
  if (!prFetched.ok) return prFetched;

  const diffEndpoint = `${prEndpoint} (diff)`;
  const diffFetched = await tryCatch(
    () =>
      client.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner: input.owner,
        repo: input.repo,
        pull_number: input.number,
        headers: { accept: 'application/vnd.github.v3.diff' },
      }),
    (cause) => mapGitHubError(cause, diffEndpoint),
  );
  if (!diffFetched.ok) return diffFetched;

  const rawDiff = String(diffFetched.value.data ?? '');
  const diffTruncated = rawDiff.length > MAX_DIFF_BYTES;
  const diff = diffTruncated ? rawDiff.slice(0, MAX_DIFF_BYTES) : rawDiff;

  const pr = prFetched.value.data;
  const messages = buildPrTriagePrompt({
    title: pr.title,
    body: pr.body ?? null,
    state: pr.state,
    draft: pr.draft ?? false,
    author: pr.user?.login ?? null,
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    labels: pr.labels.map((label) => label.name).filter((name) => name.length > 0),
    diff,
    diffTruncated,
  });

  const completed = await llm.chat({ messages, temperature: 0.2 });
  if (!completed.ok) return completed;

  const validated = parseLlmJson(completed.value.content, triageSchema);
  if (!validated.ok) return validated;

  return ok({
    summary: validated.value.summary,
    riskAreas: validated.value.riskAreas,
    suggestedLabels: validated.value.suggestedLabels,
    reviewerNotes: validated.value.reviewerNotes,
    llmModel: completed.value.model,
    diffTruncated,
  });
}

export function registerTriagePr(server: McpServer, client: GitHubClient, llm: LlmProvider): void {
  server.tool(
    'triage_pr',
    'Summarize a pull request, surface risk areas, and suggest labels using the configured LLM provider. Requires LLM_API_KEY.',
    triagePrInputSchema,
    async (args) => {
      const outcome = await triagePrHandler(client, llm, args);
      if (!outcome.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(outcome.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(outcome.value, null, 2) }] };
    },
  );
}
