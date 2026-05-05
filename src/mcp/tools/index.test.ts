import { describe, expect, test } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import { registerTools } from './index.ts';

const READ_TOOLS = [
  'ping',
  'get_repo_info',
  'search_issues',
  'get_pull_request',
  'get_pr_diff',
  'list_review_comments',
  'get_ci_status',
  'get_commit_history',
  'search_code',
];

const WRITE_TOOLS = [
  'comment_on_issue',
  'comment_on_pr',
  'label_issue',
  'create_branch',
  'commit_files',
  'open_pr',
];

function recordingServer(): { server: McpServer; toolNames: string[] } {
  const toolNames: string[] = [];
  const server = {
    tool: (name: string) => {
      toolNames.push(name);
    },
  } as unknown as McpServer;
  return { server, toolNames };
}

const stubClient = {} as unknown as GitHubClient;

describe('registerTools', () => {
  test('writesEnabled=false registers only read tools', () => {
    const { server, toolNames } = recordingServer();
    registerTools(server, { github: stubClient, cache: null, writesEnabled: false });
    for (const name of READ_TOOLS) expect(toolNames).toContain(name);
    for (const name of WRITE_TOOLS) expect(toolNames).not.toContain(name);
  });

  test('writesEnabled=true registers read + write tools', () => {
    const { server, toolNames } = recordingServer();
    registerTools(server, { github: stubClient, cache: null, writesEnabled: true });
    for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) expect(toolNames).toContain(name);
  });
});
