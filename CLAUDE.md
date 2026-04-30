# CLAUDE.md — context-bridge

Guidance for Claude Code (and any other AI assistant) working in this repository. Read this in full before making changes.

---

## Source of truth

- **Architecture:** `ARCHITECTURE.md`. Read it before suggesting structural changes.
- **Security:** `SECURITY.md`. Read it before touching token handling, URL allowlisting, or anything that talks to GitHub.
- **Roadmap:** `README.md` PR table. PRs ship in order; do not jump ahead.
- **Engineering standards:** inherited from DocMind (TypeScript strict + Result + AppError + Zod env + structured logger + repo pattern). Plus Bun-native extras.

## Non-negotiables

1. **Stdout is reserved for MCP framing.** Never `console.log`. Use the logger (writes to stderr). A single rogue stdout write corrupts the JSON-RPC protocol.
2. **No `process.env.X` outside `src/config/env.ts`.** Import the typed `env` object instead.
3. **No `throw` for expected failures.** Use `Result<T, E>` + `AppError`. Reserve `throw` for invariant violations.
4. **No raw inputs in business logic.** Validate at the MCP boundary with Zod schemas. Pass typed values down.
5. **No write operations against GitHub.** This is a read-only tool. Token scopes documented in `.env.example` are minimum-permission.
6. **No attribution to AI tooling in commits, PR bodies, or md files.** No "Co-Authored-By", no "Built with X" badges.

## Conventions

- **File layout:** vertical slices. Tool files own their tests (`ping.ts` next to `ping.test.ts`).
- **Pure handler / registration shim split:** every tool exports a pure function plus a thin `registerXxx(server)`. Tests target the pure function.
- **Imports:** explicit paths only. No barrel re-exports. `import { foo } from './lib/result.ts'` not `from './lib'`.
- **Comments:** default to none. Add a one-liner only when the WHY is non-obvious. Never describe WHAT the code does — names handle that.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`). Body wraps at 72 cols.

## Workflow

1. **Match the active phase.** Check the PR table in `README.md`. Don't introduce code for a later phase in an earlier PR.
2. **Branch per PR.** `phase-N-<slug>`. Stack on the previous phase branch when phases ship in parallel.
3. **Verify before pushing:**
   ```sh
   bun run typecheck
   bun run lint
   bun test
   ```
   All three must pass cleanly. CI re-runs them on every push.
4. **One PR, one phase.** Don't bundle unrelated changes.

## Adding a new tool

See `ARCHITECTURE.md` § "How to add a new tool". TL;DR: one file under `src/mcp/tools/`, one test file next to it, one line in `tools/index.ts`. No central switch statement.

## Adding a new error variant

See `ARCHITECTURE.md` § "How to add a new error variant". The compiler enforces exhaustive handling — if you forget a variant in `formatAppError`, build fails.

## Things to push back on

- Suggestions to add an Express, Fastify, or Koa dep — the MCP server is stdio-only; the companion UI uses Hono.
- Suggestions to switch to Vitest — we use `bun test` natively.
- Suggestions to add `dotenv` — Bun reads `.env` files automatically.
- Suggestions to add a logging library (pino, winston, etc.) — the in-tree logger is intentional; redaction + stderr-only are non-trivial requirements.
- Suggestions to expand GitHub token scopes beyond read — review `SECURITY.md` first.

## Useful commands

```sh
bun install               # install deps
bun run dev               # hot-reload dev server
bun run start             # run once
bun run typecheck         # tsc --noEmit
bun run lint              # biome check
bun run format            # biome format --write
bun test                  # bun's native test runner
bun test --watch          # tests in watch mode
bun run build             # compile to dist/context-bridge
```

## When stuck

- Boot the server and pipe JSON-RPC at it manually:
  ```sh
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | bun run src/server.ts
  ```
- Read the MCP SDK examples: https://github.com/modelcontextprotocol/typescript-sdk
- The Octokit client (PR #5+) docs: https://github.com/octokit/octokit.js
