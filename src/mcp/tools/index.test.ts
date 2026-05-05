import { describe, expect, test } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../../github/client.ts';
import { ok } from '../../lib/result.ts';
import type { LlmProvider } from '../../llm/provider.ts';
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

const LLM_TOOLS = ['summarize_issue', 'triage_pr'];
const COMPOSITE_TOOLS = ['propose_fix'];

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
const stubLlm: LlmProvider = {
  name: 'fake',
  model: 'm',
  chat: async () => ok({ content: '{}', model: 'm' }),
};

describe('registerTools', () => {
  test('only read tools registered when writes off + llm null', () => {
    const { server, toolNames } = recordingServer();
    registerTools(server, {
      github: stubClient,
      cache: null,
      writesEnabled: false,
      llm: null,
    });
    for (const name of READ_TOOLS) expect(toolNames).toContain(name);
    for (const name of [...WRITE_TOOLS, ...LLM_TOOLS, ...COMPOSITE_TOOLS]) {
      expect(toolNames).not.toContain(name);
    }
  });

  test('writes registered when writesEnabled=true', () => {
    const { server, toolNames } = recordingServer();
    registerTools(server, {
      github: stubClient,
      cache: null,
      writesEnabled: true,
      llm: null,
    });
    for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) expect(toolNames).toContain(name);
    for (const name of [...LLM_TOOLS, ...COMPOSITE_TOOLS]) expect(toolNames).not.toContain(name);
  });

  test('llm tools registered when provider non-null but composite gated on writes', () => {
    const { server, toolNames } = recordingServer();
    registerTools(server, {
      github: stubClient,
      cache: null,
      writesEnabled: false,
      llm: stubLlm,
    });
    for (const name of [...READ_TOOLS, ...LLM_TOOLS]) expect(toolNames).toContain(name);
    for (const name of [...WRITE_TOOLS, ...COMPOSITE_TOOLS]) expect(toolNames).not.toContain(name);
  });

  test('composite tools registered only when writes + llm both on', () => {
    const { server, toolNames } = recordingServer();
    registerTools(server, {
      github: stubClient,
      cache: null,
      writesEnabled: true,
      llm: stubLlm,
    });
    for (const name of [...READ_TOOLS, ...WRITE_TOOLS, ...LLM_TOOLS, ...COMPOSITE_TOOLS]) {
      expect(toolNames).toContain(name);
    }
  });
});
