import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GitHubClient } from '../../github/client.ts';
import { mapGitHubError } from '../../github/errors.ts';
import { repoCoordsSchema } from '../../github/schemas.ts';
import { type AppError, formatAppError } from '../../lib/errors.ts';
import { ok, type Result, tryCatch } from '../../lib/result.ts';
import { parseLlmJson } from '../../llm/parse.ts';
import { buildScanRepoPrompt } from '../../llm/prompts.ts';
import type { LlmProvider } from '../../llm/provider.ts';

export const scanRepoInputSchema = {
  ...repoCoordsSchema,
  createIssues: z.boolean().optional().default(false),
  returnPrompt: z.boolean().optional().default(false),
  prompt: z.string().optional(),
};

export interface ScanRepoInput {
  readonly owner: string;
  readonly repo: string;
  readonly createIssues?: boolean;
  readonly returnPrompt?: boolean;
  readonly prompt?: string | undefined;
}

const findingSchema = z.object({
  severity: z.enum(['high', 'medium', 'low']),
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  category: z.enum(['bug', 'security', 'performance', 'maintenance', 'enhancement']),
  relatedUrls: z.array(z.string()),
});

const scanResultSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(findingSchema),
});

export interface ScanRepoFinding {
  readonly severity: 'high' | 'medium' | 'low';
  readonly title: string;
  readonly description: string;
  readonly category: 'bug' | 'security' | 'performance' | 'maintenance' | 'enhancement';
  readonly relatedUrls: ReadonlyArray<string>;
}

export interface ScanRepoResult {
  readonly summary: string;
  readonly findings: ReadonlyArray<ScanRepoFinding>;
  readonly llmModel: string;
  readonly issuesCreated: number;
  readonly _prompt?: string;
}

export async function scanRepoHandler(
  client: GitHubClient,
  llm: LlmProvider,
  input: ScanRepoInput,
): Promise<Result<ScanRepoResult, AppError>> {
  const issuesFetched = await tryCatch(
    () =>
      client.rest.issues.listForRepo({
        owner: input.owner,
        repo: input.repo,
        state: 'open',
        per_page: 10,
        sort: 'updated',
        direction: 'desc',
      }),
    (cause) => mapGitHubError(cause, `GET /repos/${input.owner}/${input.repo}/issues`),
  );
  if (!issuesFetched.ok) return issuesFetched;

  const prsFetched = await tryCatch(
    () =>
      client.rest.pulls.list({
        owner: input.owner,
        repo: input.repo,
        state: 'open',
        per_page: 10,
        sort: 'updated',
        direction: 'desc',
      }),
    (cause) => mapGitHubError(cause, `GET /repos/${input.owner}/${input.repo}/pulls`),
  );
  if (!prsFetched.ok) return prsFetched;

  const ciFetched = await tryCatch(
    () =>
      client.rest.actions.listWorkflowRunsForRepo({
        owner: input.owner,
        repo: input.repo,
        per_page: 5,
      }),
    (cause) => mapGitHubError(cause, `GET /repos/${input.owner}/${input.repo}/actions/runs`),
  );
  if (!ciFetched.ok) return ciFetched;

  const commitsFetched = await tryCatch(
    () =>
      client.rest.repos.listCommits({
        owner: input.owner,
        repo: input.repo,
        per_page: 10,
      }),
    (cause) => mapGitHubError(cause, `GET /repos/${input.owner}/${input.repo}/commits`),
  );
  if (!commitsFetched.ok) return commitsFetched;

  const now = Date.now();
  const DAY_MS = 86_400_000;

  const rawIssues = issuesFetched.value.data.filter((i) => !('pull_request' in i));
  const issues = rawIssues.map((i) => ({
    number: i.number,
    title: i.title,
    state: i.state,
    labels: i.labels
      .map((l) => (typeof l === 'string' ? l : (l.name ?? '')))
      .filter((n) => n.length > 0),
    ageDays: Math.floor((now - new Date(i.created_at).getTime()) / DAY_MS),
  }));

  const rawPrs = prsFetched.value.data;
  const prs = rawPrs.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    draft: p.draft ?? false,
    ageDays: Math.floor((now - new Date(p.created_at).getTime()) / DAY_MS),
  }));

  const rawCi = ciFetched.value.data.workflow_runs ?? [];
  const ciRuns = rawCi.slice(0, 5).map((r) => ({
    name: r.name ?? '(unnamed)',
    conclusion: r.conclusion ?? null,
    branch: r.head_branch ?? '(unknown)',
    createdAt: r.created_at ?? '',
  }));

  const rawCommits = commitsFetched.value.data;
  const commits = rawCommits.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? c.commit.author?.email ?? 'unknown',
    date: c.commit.author?.date ?? '',
  }));

  const builtMessages = buildScanRepoPrompt({ issues, prs, ciRuns, commits });
  if (input.returnPrompt) {
    const promptText = builtMessages.map((m) => `${m.role === 'system' ? 'System:\n' : 'User:\n'}${m.content}`).join('\n\n---\n\n');
    return ok({ summary: '', findings: [], llmModel: '', issuesCreated: 0, _prompt: promptText });
  }
  const messages = input.prompt !== undefined ? [builtMessages[0]!, { role: 'user' as const, content: input.prompt }] : builtMessages;
  const completed = await llm.chat({ messages, temperature: 0.2 });
  if (!completed.ok) return completed;

  const validated = parseLlmJson(completed.value.content, scanResultSchema);
  if (!validated.ok) return validated;

  let issuesCreated = 0;
  if (input.createIssues === true) {
    for (const finding of validated.value.findings) {
      const body = [
        `**Severity:** ${finding.severity}`,
        `**Category:** ${finding.category}`,
        '',
        finding.description,
        '',
        ...(finding.relatedUrls.length > 0
          ? ['**Related:**', ...finding.relatedUrls.map((u) => `- ${u}`)]
          : []),
      ].join('\n');

      const created = await tryCatch(
        () =>
          client.rest.issues.create({
            owner: input.owner,
            repo: input.repo,
            title: `[scan/${finding.severity}] ${finding.title}`,
            body,
            labels: [finding.category],
          }),
        (cause) =>
          mapGitHubError(
            cause,
            `POST /repos/${input.owner}/${input.repo}/issues (${finding.title})`,
          ),
      );

      if (created.ok) issuesCreated++;
    }
  }

  return ok({
    summary: validated.value.summary,
    findings: validated.value.findings.map((f) => ({
      severity: f.severity,
      title: f.title,
      description: f.description,
      category: f.category,
      relatedUrls: f.relatedUrls,
    })),
    llmModel: completed.value.model,
    issuesCreated,
  });
}

export function registerScanRepo(server: McpServer, client: GitHubClient, llm: LlmProvider): void {
  server.tool(
    'scan_repo',
    'Analyze the repository for potential issues (bugs, security, performance, maintenance) using the LLM. Fetches recent issues, PRs, CI runs, and commits for context. Set createIssues=true to auto-file GitHub issues (requires WRITES_ENABLED). Requires LLM_API_KEY.',
    scanRepoInputSchema,
    async (args) => {
      const outcome = await scanRepoHandler(client, llm, args);
      if (!outcome.ok) {
        return { isError: true, content: [{ type: 'text', text: formatAppError(outcome.error) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(outcome.value, null, 2) }] };
    },
  );
}
