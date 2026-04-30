import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './mcp/server.ts';

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe; stdout is reserved for MCP framing.
  console.error('context-bridge: stdio MCP server connected.');
}

main().catch((err: unknown) => {
  console.error('context-bridge: fatal startup error', err);
  process.exit(1);
});
