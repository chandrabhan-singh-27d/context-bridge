# context-bridge

Local-first MCP server giving any AI assistant — Claude Code, Cursor, Windsurf — structured, read-only access to a GitHub repository: issues, pull requests, diffs, review comments, CI status, commit history, and code search. Plus a companion chat UI demonstrating the server end-to-end.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat&logo=typescript&logoColor=fff)
![Bun](https://img.shields.io/badge/Bun-1.3-fbf0df?style=flat&logo=bun&logoColor=000)
![MCP](https://img.shields.io/badge/MCP-stdio-7c3aed?style=flat)
![Octokit](https://img.shields.io/badge/Octokit-github-181717?style=flat&logo=github&logoColor=fff)
![License](https://img.shields.io/badge/license-MIT-green?style=flat)

---

## What It Does

1. **Exposes a GitHub repo as MCP tools** — `get_repo_info`, `search_issues`, `get_pull_request`, `get_pr_diff`, `list_review_comments`, `get_ci_status`, `get_commit_history`, `search_code`. Stdio transport, JSON-RPC framing, installs into any MCP-compatible client.
2. **Read-only by design** — token scopes are minimum-permission (`repo:read`, `issues:read`, `pull_requests:read`). No write tools. Documented in `SECURITY.md`.
3. **Typed-Result everywhere** — every handler returns `Result<T, AppError>`. No `throw` for expected failures. Discriminated-union errors enforce exhaustive handling at compile time.
4. **Validated at the MCP boundary** — Zod schemas on every tool input. Raw input never reaches business logic.
5. **Cached responses** — in-memory LRU + TTL today; `bun:sqlite` persistent layer (5-min TTL) lands later. Read path: LRU → SQLite → GitHub.
6. **Rate-limit aware** — `X-RateLimit-Remaining` thresholds + per-IP token bucket guard against burst exhaustion.
7. **Companion UI** — Hono + Vite + React proves the server end-to-end with a small chat client.

---

## Quick Start

Runs entirely on your machine. Only external dep is a GitHub PAT.

### Prerequisites

- Bun 1.3+
- GitHub Personal Access Token with `repo:read`, `issues:read`, `pull_requests:read`

### 1. Clone and install

```sh
git clone https://github.com/chandrabhan-singh-27d/context-bridge.git
cd context-bridge
bun install
```

### 2. Configure env

```sh
cp .env.example .env
# Edit .env → paste GITHUB_TOKEN
```

Loading order: `.env.local` → `.env` → `process.env`. Bun reads `.env` natively; no `dotenv` dep.

### 3. Run

```sh
bun run dev          # hot-reload
bun run start        # one-shot
```

### Smoke test (raw JSON-RPC)

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | bun run src/server.ts
```

### Tests

```sh
bun test             # one-shot
bun test --watch     # watch mode
```

### Build (single binary)

```sh
bun run build        # → dist/context-bridge
```

---

## Install in Claude Code

```sh
claude mcp add context-bridge bun run /path/to/context-bridge/src/server.ts
```

Then in any Claude Code session, the `get_repo_info`, `search_issues`, etc. tools are available.

---

## Architecture

```
MCP Client (Claude Code / Cursor / Windsurf)
 │
 │  stdio JSON-RPC
 │
 ▼
┌──────────── context-bridge ─────────────┐
│  src/server.ts          (entry, stdio)  │
│      │                                  │
│  src/mcp/server.ts      (factory)       │
│      │                                  │
│  src/mcp/tools/*.ts     (per-tool       │
│      │                   pure handler   │
│      │                   + register)    │
│      │                                  │
│  src/github/octokit.ts  (Octokit client)│
│      │                                  │
│  src/lib/cache          (LRU → SQLite)  │
└─────────────────────────────────────────┘
 │
 │  HTTPS (read-only, min-scope token)
 ▼
GitHub REST + GraphQL
```

See `ARCHITECTURE.md` for the dependency graph + invariants.

---

## Design Decisions

| Decision | Why |
|----------|-----|
| **Bun over Node** | MCP servers spawn per editor session — Bun cold-starts ~6ms vs Node ~40ms. Native TS, native test runner, native SQLite. Single-binary distribution via `bun build --compile`. Zero native deps in this project = zero compat risk. |
| **Hono for companion UI** | 4-5x faster than Express on Node. Web-standards (`Request`/`Response`). Runs identically on Bun. Type-safe RPC client to React without codegen. |
| **stdio transport only** | MCP framing lives on stdout. No HTTP server in the MCP path. Companion UI runs in a separate process. |
| **Read-only GitHub access** | Token scopes capped to `*:read`. No write tools exposed. Reduces blast radius of token leaks. |
| **`Result<T, E>` over try/catch** | Explicit error handling. Every handler returns `Result<T, AppError>`. Business logic has zero `try/catch`. |
| **`AppError` discriminated union** | Every error has a `type` tag. `formatAppError` exhausts the union — compiler fails if a new variant is forgotten. |
| **Zod env loader** | Single source of truth at `src/config/env.ts`. No `process.env.X` access elsewhere. |
| **Stderr-only structured logger** | Stdout is sacred (MCP framing). One JSON record per line on stderr. Auto-redaction of `token \| password \| secret \| api_key \| authorization \| cookie \| bearer` at any nesting depth. |
| **In-memory LRU + persistent SQLite** | LRU front for hot reads; `bun:sqlite` 5-min TTL for cross-restart survival. Read: LRU → SQLite → GitHub. |
| **Vertical-slice file layout** | Tool files own their tests. `ping.ts` next to `ping.test.ts`. No central test directory, no central switch statement. Discovery is by file convention. |
| **Pure handler / register shim split** | Every tool exports a pure function (testable without MCP) plus a thin `registerXxx(server)`. Tests target the pure function. |
| **`bun test` over Vitest** | Same `expect()` API, ~10x faster, no extra dep. |
| **`bun:sqlite` over `better-sqlite3`** | Zero install. No native build step. No Node version skew. |

---

## Security Model

- **Read-only token scopes** — `repo:read`, `issues:read`, `pull_requests:read`. No `repo`, no `workflow`, no `delete_repo`.
- **Boundary validation** — every MCP tool input is parsed by a Zod schema before it reaches business logic.
- **URL allowlisting** — outbound HTTP restricted to `api.github.com`. Documented in `SECURITY.md`.
- **No raw env access** — `process.env.X` forbidden outside `src/config/env.ts`. Validated at startup.
- **Logger redaction** — keys matching `token | password | secret | api_key | authorization | cookie | bearer` are auto-redacted at any nesting depth (case-insensitive).
- **Rate-limit awareness** — per-IP token bucket on the companion UI; `X-RateLimit-Remaining` soft/hard thresholds on outbound GitHub calls.
- **No write surface** — server exposes only read tools. Octokit client is constructed without write scopes.
- **No AI-tool attribution** in commits, PR bodies, or md files. No "Co-Authored-By", no badges.

See `SECURITY.md` for the full threat model.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Bun 1.3+ |
| **Language** | TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) |
| **MCP SDK** | `@modelcontextprotocol/sdk` (stdio transport) |
| **GitHub Client** | Octokit (`@octokit/rest`) |
| **Validation** | Zod |
| **Lint / Format** | Biome |
| **Tests** | `bun test` (native) |
| **Cache** | In-memory LRU+TTL primitive · `bun:sqlite` persistent layer |
| **Logger** | In-tree structured JSON logger (stderr only, auto-redaction) |
| **Companion UI** | Hono + Vite + React |
| **Distribution** | `bun build --compile` → single static binary |

---

## Project Structure

```
src/
├── server.ts                  # entry: builds MCP server + connects stdio
├── config/
│   ├── env.ts                 # Zod-validated env loader (Result-returning)
│   └── env.test.ts
├── lib/
│   ├── result.ts              # Result<T, E> + helpers
│   ├── errors.ts              # AppError discriminated union
│   ├── cache/lru-cache.ts     # LRU+TTL primitive
│   └── logging/logger.ts      # structured JSON logger w/ redaction
├── github/
│   └── octokit.ts             # Octokit client + auth check
└── mcp/
    ├── server.ts              # buildServer() factory + SERVER_INFO
    └── tools/
        ├── index.ts           # registerTools() — fan-out per tool
        ├── ping.ts            # health-check tool
        └── get-repo-info.ts   # repo metadata tool

.env.example          # required + optional env vars, documented
biome.json            # lint + format config
tsconfig.json         # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
ARCHITECTURE.md       # dependency graph + invariants
SECURITY.md           # threat model, scopes, redaction
CLAUDE.md             # AI-assistant guardrails
```

---

## Tests

```sh
bun test             # one-shot
bun test --watch     # watch mode
```

Covers `Result`/`AppError` primitives, the Zod env loader, the LRU+TTL cache, the structured logger (including redaction), the MCP server factory, and per-tool pure handlers.

---

## License

MIT — see [LICENSE](LICENSE).
