import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Health-check tool. Cheap. No external calls. Verifies the MCP transport
 * is wired correctly and the server is responsive end-to-end.
 */
export function pingHandler(): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [
      {
        type: 'text',
        text: `pong @ ${new Date().toISOString()}`,
      },
    ],
  };
}

export function registerPing(server: McpServer): void {
  server.tool(
    'ping',
    'Health check. Returns "pong @ <ISO timestamp>". Use to verify the server is reachable.',
    {},
    () => pingHandler(),
  );
}
