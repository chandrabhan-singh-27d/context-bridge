import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { issueNumber, repoCoordsSchema } from '../../github/schemas.ts';

export const reviewPrArgsSchema = {
  ...repoCoordsSchema,
  number: issueNumber,
};

export interface ReviewPrArgs {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
}

export function buildReviewPrPrompt(args: ReviewPrArgs): GetPromptResult {
  const { owner, repo, number } = args;
  const text = [
    `You are reviewing pull request #${number} in ${owner}/${repo}.`,
    '',
    'Use the available MCP tools in this order:',
    `  1. get_pull_request(owner=${owner}, repo=${repo}, number=${number}) — read title, description, branches, change size.`,
    `  2. get_pr_diff(owner=${owner}, repo=${repo}, number=${number}) — read the actual changes.`,
    `  3. list_review_comments(owner=${owner}, repo=${repo}, number=${number}) — see existing reviewer feedback.`,
    '',
    'Then produce a structured review covering:',
    '  - Correctness: bugs, edge cases, error handling.',
    '  - Security: input validation, secrets, injection vectors.',
    '  - Tests: coverage of new behavior, missing failure cases.',
    '  - Maintainability: naming, dead code, abstractions that earn their keep.',
    '',
    'Cite file paths and line numbers from the diff. Flag anything you cannot verify without more context.',
  ].join('\n');

  return {
    description: `Guided code review for ${owner}/${repo}#${number}`,
    messages: [
      {
        role: 'user',
        content: { type: 'text', text },
      },
    ],
  };
}

export function registerReviewPrPrompt(server: McpServer): void {
  server.prompt(
    'review-pr',
    'Guided code review of a GitHub pull request. Walks the assistant through fetching metadata, diff, and existing comments before producing a structured review.',
    reviewPrArgsSchema,
    (args) => buildReviewPrPrompt(args),
  );
}
