import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerInvestigateIssuePrompt } from './investigate-issue.ts';
import { registerReviewPrPrompt } from './review-pr.ts';

export function registerPrompts(server: McpServer): void {
  registerReviewPrPrompt(server);
  registerInvestigateIssuePrompt(server);
}
