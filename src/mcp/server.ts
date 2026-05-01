import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ToolDeps, registerTools } from './tools/index.ts';

export const SERVER_INFO = {
  name: 'context-bridge',
  version: '0.0.1',
} as const;

export function buildServer(deps: ToolDeps): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerTools(server, deps);
  return server;
}
