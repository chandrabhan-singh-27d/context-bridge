import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { AppError, formatAppError } from '../../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../../lib/result.ts';
import { parseLlmJson } from '../../llm/parse.ts';
import { buildProposeFixPrompt } from '../../llm/prompts.ts';
import type { LlmProvider } from '../../llm/provider.ts';
import { commitFilesHandler } from './commit-files.ts';
import { createBranchHandler } from './create-branch.ts';
import { openPrHandler } from './open-pr.ts';
import {
  ensureClosesMarker,
  fetchRelevantFiles,
  MAX_COMMENTS,
  proposalSchema,
  proposeFixInputSchema,
} from './propose-fix-internals.ts';

export { proposeFixInputSchema };

export interface ProposeFixInput {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly relevantPaths?: ReadonlyArray<string> | undefined;
  readonly baseBranch?: string | undefined;
  readonly draft?: boolean | undefined;
}

export interface ProposeFixResult {
  readonly prNumber: number;
  readonly prUrl: string;
  readonly branchName: string;
  readonly commitSha: string;
  readonly llmModel: string;
}

export async function proposeFixHandler(
  client: GitHubClient,
  llm: LlmProvider,
  input: ProposeFixInput,
): Promise<Result<ProposeFixResult, AppError>> {
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

  const fileContext =
    input.relevantPaths !== undefined && input.relevantPaths.length > 0
      ? await fetchRelevantFiles(client, input.owner, input.repo, input.relevantPaths)
      : ok([]);
  if (!fileContext.ok) return fileContext;

  const issue = issueFetched.value.data;
  const messages = buildProposeFixPrompt({
    issueNumber: input.number,
    issueTitle: issue.title,
    issueBody: issue.body ?? null,
    issueAuthor: issue.user?.login ?? null,
    issueLabels: issue.labels
      .map((label) => (typeof label === 'string' ? label : (label.name ?? '')))
      .filter((name) => name.length > 0),
    comments: commentsFetched.value.data.map((comment) => ({
      author: comment.user?.login ?? null,
      body: comment.body ?? '',
    })),
    files: fileContext.value,
  });

  const completed = await llm.chat({ messages, temperature: 0.1, maxTokens: 8_000 });
  if (!completed.ok) return completed;

  const validated = parseLlmJson(completed.value.content, proposalSchema);
  if (!validated.ok) return validated;
  const proposal = validated.value;
  if (proposal.files.length === 0) {
    return err(
      AppError.internal(
        `LLM returned empty files array — refusing to open empty PR. LLM body:\n${proposal.prBody}`,
      ),
    );
  }

  const created = await createBranchHandler(client, {
    owner: input.owner,
    repo: input.repo,
    name: proposal.branchName,
    ...(input.baseBranch !== undefined ? { fromRef: input.baseBranch } : {}),
  });
  if (!created.ok) return created;

  const committed = await commitFilesHandler(client, {
    owner: input.owner,
    repo: input.repo,
    branch: proposal.branchName,
    message: proposal.commitMessage,
    files: proposal.files,
  });
  if (!committed.ok) return committed;

  const repoMeta = await tryCatch(
    () => client.rest.repos.get({ owner: input.owner, repo: input.repo }),
    (cause) => mapGitHubError(cause, `GET /repos/${input.owner}/${input.repo}`),
  );
  if (!repoMeta.ok) return repoMeta;
  const baseRef = input.baseBranch ?? repoMeta.value.data.default_branch;

  const opened = await openPrHandler(client, {
    owner: input.owner,
    repo: input.repo,
    head: proposal.branchName,
    base: baseRef,
    title: proposal.prTitle,
    body: ensureClosesMarker(proposal.prBody, input.number),
    ...(input.draft !== undefined ? { draft: input.draft } : { draft: true }),
  });
  if (!opened.ok) return opened;

  return ok({
    prNumber: opened.value.number,
    prUrl: opened.value.htmlUrl,
    branchName: proposal.branchName,
    commitSha: committed.value.commitSha,
    llmModel: completed.value.model,
  });
}

export function registerProposeFix(
  server: McpServer,
  client: GitHubClient,
  llm: LlmProvider,
): void {
  server.tool(
    'propose_fix',
    'Read a GitHub issue, prompt the LLM for a patch, then create a branch + commit + draft PR (with `Closes #N` in the body). Optionally pass `relevantPaths` to give the LLM current file contents. Composite tool — requires WRITES_ENABLED + LLM_API_KEY.',
    proposeFixInputSchema,
    async (args) => {
      const outcome = await proposeFixHandler(client, llm, args);
      if (!outcome.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(outcome.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(outcome.value, null, 2) }] };
    },
  );
}
