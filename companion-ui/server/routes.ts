import { Hono } from 'hono';
import type { Logger } from '../../src/lib/logging/logger.ts';
import type { McpBridge } from './mcp-bridge.ts';
import { rateLimit } from './rate-limit.ts';
import type { TokenBucket } from './token-bucket.ts';

export type RouteDeps = {
  readonly bridge: McpBridge;
  readonly bucket: TokenBucket;
  readonly logger: Logger;
  readonly webRoot?: string;
};

export function createApp(deps: RouteDeps): Hono {
  const app = new Hono();
  const log = deps.logger;

  app.get('/api/health', (c) =>
    c.json({ ok: true, mcp: deps.bridge.isAlive(), bucketSize: deps.bucket.size() }),
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
