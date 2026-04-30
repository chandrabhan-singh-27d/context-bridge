# context-bridge

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat&logo=typescript&logoColor=fff)
![Bun](https://img.shields.io/badge/Bun-1.3-fbf0df?style=flat&logo=bun&logoColor=000)
![License](https://img.shields.io/badge/license-MIT-green?style=flat)

MCP (Model Context Protocol) server that gives any AI assistant — Claude Code, Cursor, Windsurf — structured access to a GitHub repository: issues, pull requests, diffs, review comments, CI status, commit history, and code search. Plus a companion chat UI demonstrating the server end-to-end.

**Why Bun?** MCP servers spawn per editor session. Bun cold-starts in ~6ms vs Node's ~40ms. Plus zero native deps in this project = zero compatibility risk. Single-binary distribution via `bun build --compile`.

**Why Hono?** The companion UI server uses Hono — 4-5x faster than Express on Node, web-standards (`Request`/`Response`), runs identically on Bun. Type-safe RPC client to the React frontend without codegen.

---

## Status

🚧 Phase 0 — bootstrap. PR roadmap below.

| PR | Phase | Scope |
|----|-------|-------|
| #1 | Bootstrap | This PR. Project scaffold, CI, lint, typecheck. |
| #2 | MCP skeleton | stdio transport, `ping` tool, installable in Claude Code. |
| #3 | GitHub auth | Zod env loader, Octokit init, `get_repo_info` tool. |
| #4 | Issues + PRs | `search_issues`, `get_pull_request`, `get_pr_diff`, `list_review_comments`. |
| #5 | CI + commits + code | `get_ci_status`, `get_commit_history`, `search_code`. |
| #6 | Resources + Prompts | `repo://readme`, `repo://structure`, `repo://recent-activity`, `review-pr`, `investigate-issue`. |
| #7 | Cache layer | `bun:sqlite` 5-min TTL response cache. |
| #8 | Rate-limit awareness | `X-RateLimit-Remaining` thresholds. |
| #9 | Companion UI | Hono + Vite + React, MCP client demo. |
| #10 | Distribution | `bun build --compile`, npm publish prep, README polish. |

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

## Project layout

```
src/
└── server.ts          # entry (MCP server stdio transport — lands in PR #2)

.github/workflows/    # CI: typecheck + lint + test on every push/PR
.env.example          # required + optional env vars, documented
biome.json            # lint + format config
tsconfig.json         # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
```

## License

MIT (added in PR #10 with full text).
