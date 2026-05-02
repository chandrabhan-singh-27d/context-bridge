# context-bridge — Architecture Guide

Quick reference for understanding the codebase. Read this before contributing.

---

## What this project is

A Model Context Protocol (MCP) server that gives any MCP-compatible client (Claude Code, Cursor, Windsurf, etc.) structured access to a GitHub repository. Plus a companion chat UI (PR #11) that demonstrates the server in action.

The MCP server is the real product. The chat UI is proof.

## Runtime

Bun 1.3+. Chosen because:

1. **Cold start.** MCP servers spawn per editor session. Bun starts in ~6ms; Node ~40ms. Editor latency is felt by users.
2. **Native TS.** No build step. `bun run src/server.ts` runs source directly.
3. **Native test runner.** `bun test` replaces Vitest. Same `expect()` API, ~10x faster.
4. **Native SQLite (`bun:sqlite`).** Replaces `better-sqlite3`. Zero install. Used by the cache layer in PR #9.
5. **Single-binary distribution.** `bun build --compile` produces a static binary. No Node version skew on user machines.

Zero native deps in this project = zero Bun-compat risk. Verified before committing the runtime choice.

## Dependency graph

Read bottom-up. Lower layers know nothing about layers above.

```
src/server.ts                    ← entry: builds MCP server, connects stdio
  src/mcp/server.ts              ← buildServer() factory + SERVER_INFO
    src/mcp/tools/index.ts       ← registerTools() — fan-out to per-tool registers
      src/mcp/tools/<tool>.ts    ← pure handler + registration shim per tool

src/config/env.ts                ← Zod env loader, returns Result
  src/lib/result.ts              ← Result<T, E> primitive
  src/lib/errors.ts              ← AppError discriminated union

src/lib/logging/logger.ts        ← structured logger (stderr only)
src/lib/cache/lru-cache.ts       ← LRU + TTL cache primitive
```

Sibling process (in-tree but separate runtime):

```
companion-ui/server/index.ts            ← Bun.serve entry (Hono app)
  companion-ui/server/routes.ts         ← /api/health, /api/tools, /api/call
  companion-ui/server/mcp-bridge.ts     ← spawns src/server.ts, JSON-RPC over stdio
  companion-ui/server/token-bucket.ts   ← per-IP burst primitive
  companion-ui/server/rate-limit.ts     ← Hono middleware over the bucket
  companion-ui/server/env.ts            ← COMPANION_* Zod loader (separate from MCP env)
  companion-ui/web/                     ← static HTML/JS console served by Hono
```

The companion process re-uses `src/lib/result.ts`, `src/lib/errors.ts`, and `src/lib/logging/logger.ts` directly. It never imports from `src/mcp/**` — communication is stdio + JSON-RPC, exactly like a third-party client.

## Key invariants

1. **stdout is sacred.** Stdout carries MCP JSON-RPC framing. Never `console.log`. Use the logger (writes to stderr). Even `console.error` is fine; it's stdout that breaks the protocol.
2. **No `process.env.X` outside `src/config/env.ts`.** Every other module imports the typed `env` object. One source of truth, validated at startup.
3. **No `throw` for expected failures.** Use `Result<T, E>` + `AppError`. Reserve `throw` for invariant violations (programmer errors).
4. **No raw inputs in business logic.** Validate at the MCP boundary with Zod. Pass typed values down.
5. **Pure handler / registration shim split.** Every tool has a pure handler function (testable without MCP) and a thin `registerXxx(server)` function that wires it up.
6. **Tool files own their tests.** `ping.ts` next to `ping.test.ts`. No central test file.

## How to add a new tool

1. Create `src/mcp/tools/<name>.ts`:
   - Export a pure handler function: `export function <name>Handler(args): { content: [...] }`.
   - Export `register<Name>(server: McpServer)` that calls `server.tool(name, description, inputSchema, args => <name>Handler(args))`.
2. Create `src/mcp/tools/<name>.test.ts`:
   - Test the pure handler directly. No MCP imports beyond `McpServer` for the type.
3. Add one line to `src/mcp/tools/index.ts`: `register<Name>(server)`.
4. Run `bun test`, `bun run typecheck`, `bun run lint`. Commit.

Do NOT add a switch statement somewhere central. Discovery is by file convention.

## How to add a new error variant

1. Append to `AppError` in `src/lib/errors.ts`.
2. Add a constructor in the `AppError` namespace.
3. Update `formatAppError`'s switch — the compiler will fail until every variant is handled.
4. Add the new variant to the `isAppError` type guard.
5. Add tests.

## Testing

- `bun test` runs every `*.test.ts` under `src/`.
- Unit tests cover primitives directly (no mocks needed for pure functions).
- Integration tests for the MCP server use a fake stdio transport (lands with PR #5+).
- E2E test will boot the real binary and pipe JSON-RPC at it (lands with PR #12).

## Logging

Structured JSON, one record per line, on stderr. Levels: `debug | info | warn | error`. Configured via `LOG_LEVEL` env var (default `info`).

Fields are auto-redacted when keys match `token | password | secret | api_key | authorization | cookie | bearer` (case-insensitive, at any nesting depth). When in doubt, log the wrapped object — the redactor will catch it.

For per-request context: `const log = baseLogger.child({ requestId, tool })`. Children inherit + extend.

## Caching

Two layers:

1. **In-memory LRU + TTL** (`src/lib/cache/lru-cache.ts`). Hot reads. Survives a single server lifetime.
2. **bun:sqlite persistent** (PR #9). Survives restarts. Used for GitHub API responses with 5-minute TTL.

The persistent layer puts the in-memory LRU in front. Read path: LRU → SQLite → GitHub. Write path: GitHub response populates both.

## Distribution

Three paths (all land in PR #12):

1. `bunx context-bridge` — npm-registry install for users with Bun.
2. `bun build --compile` — single static binary, no Bun required on target.
3. Source-run — `claude mcp add context-bridge bun run /path/to/src/server.ts` for development.

## Things that are deliberately NOT here

- No HTTP server in the MCP path. stdio only. The companion UI (PR #11) has its own Hono server, separate process.
- No global state outside the server registration step.
- No barrel exports. Import from source files directly.
- No write access to GitHub. Token scopes are intentionally read-only (`repo:read`, `issues:read`, `pull_requests:read`). Documented in `.env.example` and `SECURITY.md`.
