import { Hono } from 'hono';
import type { Logger } from '../../src/lib/logging/logger.ts';
import type { McpBridge } from './mcp-bridge.ts';
import { rateLimit } from './rate-limit.ts';
import type { TokenBucket } from './token-bucket.ts';
import { ISSUE_SYSTEM_PROMPT, PR_SYSTEM_PROMPT, PROPOSE_FIX_SYSTEM_PROMPT, SCAN_SYSTEM_PROMPT } from '../../src/llm/prompts.ts';
import { SCAN_AND_FIX_PROMPT } from '../../src/mcp/tools/auto-triage.ts';

const SYSTEM_PROMPTS: Record<string, string> = {
  scan_repo: SCAN_SYSTEM_PROMPT,
  auto_triage: SCAN_AND_FIX_PROMPT,
  summarize_issue: ISSUE_SYSTEM_PROMPT,
  triage_pr: PR_SYSTEM_PROMPT,
  propose_fix: PROPOSE_FIX_SYSTEM_PROMPT,
};

export type RouteDeps = {
  readonly bridge: McpBridge;
  readonly bucket: TokenBucket;
  readonly logger: Logger;
  readonly webRoot?: string;
  readonly defaultRepo?: string;
};

export function createApp(deps: RouteDeps): Hono {
  const app = new Hono();
  const log = deps.logger;

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      mcp: deps.bridge.isAlive(),
      bucketSize: deps.bucket.size(),
      defaultRepo: deps.defaultRepo ?? null,
    }),
  );

  const api = new Hono();
  api.use('*', rateLimit({ bucket: deps.bucket }));

  api.get('/tools', async (c) => {
    const r = await deps.bridge.listTools();
    if (!r.ok) {
      log.warn('tools/list failed', { error: r.error.message });
      return c.json({ error: r.error.message }, 502);
    }
    return c.json(r.value);
  });

  api.post('/call', async (c) => {
    let body: { name?: unknown; arguments?: unknown };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    if (typeof body.name !== 'string' || body.name.length === 0) {
      return c.json({ error: 'name_required' }, 400);
    }
    const args =
      body.arguments !== undefined && typeof body.arguments === 'object' && body.arguments !== null
        ? (body.arguments as Record<string, unknown>)
        : {};
    const r = await deps.bridge.callTool(body.name, args);
    if (!r.ok) {
      log.warn('tools/call failed', { tool: body.name, error: r.error.message });
      return c.json({ error: r.error.message }, 502);
    }
    return c.json(r.value);
  });

  api.get('/system-prompt/:toolName', (c) => {
    const toolName = c.req.param('toolName');
    const prompt = SYSTEM_PROMPTS[toolName];
    if (prompt === undefined) {
      return c.json({ error: `unknown tool: ${toolName}` }, 404);
    }
    return c.json({ toolName, prompt });
  });

  app.route('/api', api);

  if (deps.webRoot !== undefined) {
    const root = deps.webRoot;
    app.get('*', async (c) => {
      const url = new URL(c.req.url);
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = Bun.file(`${root}${path}`);
      if (await file.exists()) {
        return new Response(file);
      }
      const fallback = Bun.file(`${root}/index.html`);
      if (await fallback.exists()) return new Response(fallback);
      return c.notFound();
    });
  }

  return app;
}
