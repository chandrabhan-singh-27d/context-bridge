import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPing } from './ping.ts';

export function registerTools(server: McpServer): void {
  registerPing(server);
  // Future tools register here. Each tool owns its own file + tests.
}
