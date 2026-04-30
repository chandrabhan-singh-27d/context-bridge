# context-bridge

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat&logo=typescript&logoColor=fff)
![Bun](https://img.shields.io/badge/Bun-1.3-fbf0df?style=flat&logo=bun&logoColor=000)
![License](https://img.shields.io/badge/license-MIT-green?style=flat)

MCP (Model Context Protocol) server that gives any AI assistant — Claude Code, Cursor, Windsurf — structured access to a GitHub repository: issues, pull requests, diffs, review comments, CI status, commit history, and code search. Plus a companion chat UI demonstrating the server end-to-end.

**Why Bun?** MCP servers spawn per editor session. Bun cold-starts in ~6ms vs Node's ~40ms. Plus zero native deps in this project = zero compatibility risk. Single-binary distribution via `bun build --compile`.

**Why Hono?** The companion UI server uses Hono — 4-5x faster than Express on Node, web-standards (`Request`/`Response`), runs identically on Bun. Type-safe RPC client to the React frontend without codegen.

---

## Status

✅ Phase 0 (PR #1) — bootstrap.
✅ Phase 1 (PR #2) — MCP skeleton: stdio transport + `ping` tool.
🚧 Phase 2 (PR #3) — Foundation primitives: Result/AppError/env/logging/LRU.

| PR | Phase | Scope |
|----|-------|-------|
| #1 | Bootstrap | Project scaffold, lint, typecheck. ✅ |
| #2 | MCP skeleton | stdio transport, `ping` tool, installable in Claude Code. ✅ |
| #3 | Foundation primitives | `Result<T,E>`, `AppError` discriminated union, Zod env loader, structured logger, LRU+TTL cache. 🚧 |
| #4 | Governance docs | `ARCHITECTURE.md`, `CLAUDE.md`, `AGENTS.md`, `SECURITY.md`, PR template, dependabot, lefthook. |
| #5 | GitHub auth | Octokit init, auth check, `get_repo_info` tool. |
| #6 | Issues + PRs | `search_issues`, `get_pull_request`, `get_pr_diff`, `list_review_comments`. |
| #7 | CI + commits + code | `get_ci_status`, `get_commit_history`, `search_code`. |
| #8 | Resources + Prompts | `repo://readme`, `repo://structure`, `repo://recent-activity`, `review-pr`, `investigate-issue`. |
| #9 | Cache layer | `bun:sqlite` 5-min TTL response cache (uses LRU from PR #3 in front). |
| #10 | Rate-limit awareness | `X-RateLimit-Remaining` thresholds. |
| #11 | Companion UI | Hono + Vite + React, MCP client demo. |
| #12 | Distribution | `bun build --compile`, npm publish prep, README polish. |

## Quick Start (dev)

```sh
bun install
cp .env.example .env
# edit .env: paste a GitHub PAT with repo:read, issues:read, pull_requests:read
bun run dev
```

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Hot-reload dev server (`bun --hot`). |
| `bun run start` | Run the server once. |
| `bun run typecheck` | TS strict typecheck (no emit). |
| `bun run lint` | Biome lint. |
| `bun run format` | Biome format-write. |
| `bun test` | Run all tests via Bun's native runner. |
| `bun run build` | Compile to single static binary at `dist/context-bridge`. |

## Engineering standards

This project inherits the DocMind floor:

- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- `Result<T, E>` over `throw` for expected failures.
- `AppError` discriminated union — every error has a `type` tag, every handler exhausts the union.
- Zod-validated env loader. Never reach for `process.env.X` outside `src/config/env.ts`.
- Structured JSON logger to stderr, automatic redaction of sensitive keys.
- Vertical-slice feature folders. Pure handler / registration shim split for every tool.
- Repository pattern (lands with the GitHub data layer in PR #5).
- Per-IP token-bucket rate limiter (lands with PR #10).

Plus Bun-native extras: `bun test` over Vitest, `bun:sqlite` over `better-sqlite3` (PR #9), single-binary distribution (PR #12).

## Project layout

```
src/
├── server.ts                  # entry: builds MCP server + connects stdio transport
├── config/
│   ├── env.ts                 # Zod-validated env loader (Result-returning)
│   └── env.test.ts
├── lib/
│   ├── result.ts              # Result<T, E> + helpers
│   ├── result.test.ts
│   ├── errors.ts              # AppError discriminated union
│   ├── errors.test.ts
│   ├── cache/
│   │   ├── lru-cache.ts       # LRU+TTL primitive
│   │   └── lru-cache.test.ts
│   └── logging/
│       ├── logger.ts          # structured JSON logger w/ redaction
│       └── logger.test.ts
└── mcp/
    ├── server.ts              # buildServer() factory + SERVER_INFO
    ├── server.test.ts
    └── tools/
        ├── index.ts           # registerTools() — every new tool registers here
        ├── ping.ts            # health-check tool
        └── ping.test.ts

.env.example          # required + optional env vars, documented
biome.json            # lint + format config
tsconfig.json         # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
```

## Installing in Claude Code (after PR #2 merges)

```sh
claude mcp add context-bridge bun run /path/to/context-bridge/src/server.ts
```

Then in any Claude Code session: `> ping` should return `pong @ <timestamp>`.

## License

MIT (added in PR #10 with full text).
