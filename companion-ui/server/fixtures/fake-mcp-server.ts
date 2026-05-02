/**
 * Minimal fake MCP server for bridge tests. Newline-delimited JSON-RPC.
 * Supports: initialize, tools/list, tools/call (echoes args), notifications/initialized.
 */

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: unknown;
};

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buf += chunk;
  let nl = buf.indexOf('\n');
  while (nl !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line.length > 0) handle(line);
    nl = buf.indexOf('\n');
  }
});

function handle(line: string): void {
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(line) as JsonRpcRequest;
  } catch {
    return;
  }

  if (req.method === 'notifications/initialized') return;

  let result: unknown;
  switch (req.method) {
    case 'initialize':
      result = {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'fake-mcp', version: '0.0.1' },
      };
      break;
    case 'tools/list':
      result = {
        tools: [
          { name: 'ping', description: 'health', inputSchema: { type: 'object' } },
          { name: 'echo', description: 'echo args', inputSchema: { type: 'object' } },
        ],
      };
      break;
    case 'tools/call': {
      const params = (req.params ?? {}) as { name?: string; arguments?: unknown };
      if (params.name === 'fail') {
        process.stdout.write(
          `${JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'boom' } })}\n`,
        );
        return;
      }
      result = {
        content: [
          { type: 'text', text: JSON.stringify({ name: params.name, args: params.arguments }) },
        ],
      };
      break;
    }
    default:
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'method not found' } })}\n`,
      );
      return;
  }

  if (req.id !== undefined) {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: req.id, result })}\n`);
  }
}
