import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { issueNumber, repoCoordsSchema } from '../../github/schemas.ts';
import { type AppError, formatAppError } from '../../lib/errors.ts';
import { ok, type Result, tryCatch } from '../../lib/result.ts';
import { parseLlmJson } from '../../llm/parse.ts';
import { buildIssueSummaryPrompt } from '../../llm/prompts.ts';
import type { LlmProvider } from '../../llm/provider.ts';

const MAX_COMMENTS = 20;

export const summarizeIssueInputSchema = {
  ...repoCoordsSchema,
  number: issueNumber,
};

export interface SummarizeIssueInput {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
}

const summarySchema = z.object({
  summary: z.string().min(1),
  suggestedLabels: z.array(z.string()),
  suggestedNextSteps: z.array(z.string()),
});

export interface SummarizeIssueResult {
  readonly summary: string;
  readonly suggestedLabels: ReadonlyArray<string>;
  readonly suggestedNextSteps: ReadonlyArray<string>;
  readonly llmModel: string;
}

export async function summarizeIssueHandler(
  client: GitHubClient,
  llm: LlmProvider,
  input: SummarizeIssueInput,
): Promise<Result<SummarizeIssueResult, AppError>> {
  const issueEndpoint = `GET /repos/${input.owner}/${input.repo}/issues/${input.number}`;
  const issueFetched = await tryCatch(
    () =>
      client.rest.issues.get({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.number,
      }),
    (cause) => mapGitHubError(cause, issueEndpoint),
  );
  if (!issueFetched.ok) return issueFetched;

  const commentsEndpoint = `GET /repos/${input.owner}/${input.repo}/issues/${input.number}/comments`;
  const commentsFetched = await tryCatch(
    () =>
      client.rest.issues.listComments({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.number,
        per_page: MAX_COMMENTS,
      }),
    (cause) => mapGitHubError(cause, commentsEndpoint),
  );
  if (!commentsFetched.ok) return commentsFetched;

  const issue = issueFetched.value.data;
  const messages = buildIssueSummaryPrompt({
    title: issue.title,
    body: issue.body ?? null,
    state: issue.state,
    labels: issue.labels
      .map((label) => (typeof label === 'string' ? label : (label.name ?? '')))
      .filter((name) => name.length > 0),
    author: issue.user?.login ?? null,
    comments: commentsFetched.value.data.map((comment) => ({
      author: comment.user?.login ?? null,
      body: comment.body ?? '',
    })),
  });

  const completed = await llm.chat({ messages, temperature: 0.2 });
  if (!completed.ok) return completed;

  const validated = parseLlmJson(completed.value.content, summarySchema);
  if (!validated.ok) return validated;

  return ok({
    summary: validated.value.summary,
    suggestedLabels: validated.value.suggestedLabels,
    suggestedNextSteps: validated.value.suggestedNextSteps,
    llmModel: completed.value.model,
  });
}

export function registerSummarizeIssue(
  server: McpServer,
  client: GitHubClient,
  llm: LlmProvider,
): void {
  server.tool(
    'summarize_issue',
    'Summarize a GitHub issue and suggest labels + next steps using the configured LLM provider. Requires LLM_API_KEY.',
    summarizeIssueInputSchema,
    async (args) => {
      const outcome = await summarizeIssueHandler(client, llm, args);
      if (!outcome.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(outcome.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(outcome.value, null, 2) }] };
    },
  );
}
