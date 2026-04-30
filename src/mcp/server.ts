import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools/index.ts';

export const SERVER_INFO = {
  name: 'context-bridge',
  version: '0.0.1',
} as const;

export function buildServer(): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerTools(server);
  return server;
}
