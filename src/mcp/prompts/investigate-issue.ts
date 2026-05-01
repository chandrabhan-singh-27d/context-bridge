import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { issueNumber, repoCoordsSchema } from '../../github/schemas.ts';

export const investigateIssueArgsSchema = {
  ...repoCoordsSchema,
  number: issueNumber,
};

export interface InvestigateIssueArgs {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
}

export function buildInvestigateIssuePrompt(args: InvestigateIssueArgs): GetPromptResult {
  const { owner, repo, number } = args;
  const text = [
    `You are investigating issue #${number} in ${owner}/${repo}.`,
    '',
    'Use the available MCP tools to gather context:',
    `  1. search_issues(owner=${owner}, repo=${repo}, query="#${number}") — confirm the issue and find duplicates / linked issues.`,
    `  2. search_code(owner=${owner}, repo=${repo}, query=<symbols or error strings>) — locate relevant code.`,
    `  3. get_commit_history(owner=${owner}, repo=${repo}, path=<file>) — find recent changes near the suspect code.`,
    '  4. get_pull_request / get_pr_diff for any PR referenced in the issue thread.',
    '',
    'Then produce:',
    '  - Reproduction hypothesis: minimal steps that trigger the reported behavior.',
    '  - Suspected root cause: file:line citations from search_code.',
    '  - Risk surface: who else touches this code path (commit history).',
    '  - Next checks: what the engineer should run / verify before committing to a fix.',
    '',
    'Stay read-only. Do not propose code edits without first confirming the cause.',
  ].join('\n');

  return {
    description: `Guided investigation for ${owner}/${repo}#${number}`,
    messages: [
      {
        role: 'user',
        content: { type: 'text', text },
      },
    ],
  };
}

export function registerInvestigateIssuePrompt(server: McpServer): void {
  server.prompt(
    'investigate-issue',
    'Guided investigation of a GitHub issue. Walks the assistant through searching issues + code + commit history before forming a root-cause hypothesis.',
    investigateIssueArgsSchema,
    (args) => buildInvestigateIssuePrompt(args),
  );
}
