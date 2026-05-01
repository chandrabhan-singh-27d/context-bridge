# CLAUDE.md — context-bridge

Pointers. Read referenced docs before structural changes.

- **Architecture:** `ARCHITECTURE.md`
- **Security:** `SECURITY.md`
- **Roadmap:** `README.md` PR table — ship in order
- **Standards:** TS strict + Result + AppError + Zod env + structured logger (inherited from DocMind)

## Non-negotiables

1. Stdout reserved for MCP framing. Never `console.log` — use logger (stderr).
2. No `process.env.X` outside `src/config/env.ts`.
3. No `throw` for expected failures — use `Result<T, E>` + `AppError`.
4. Validate raw inputs at MCP boundary with Zod.
5. Read-only against GitHub. Min-scope tokens.
6. No AI attribution in commits/PRs/md.

## Conventions

- Vertical slices: tool + test colocated.
- Pure handler + thin `registerXxx(server)` shim. Tests target pure fn.
- Explicit import paths. No barrels.
- Comments only when WHY non-obvious.
- Commits: `[TYPE]: message`. Types: `FIX FEAT REFACTOR CHORE DOCS STYLE TEST PERF`. No body unless complex.
- Branches: `phase-N-<slug>`. PR base = `main` always. Rebase onto main between phases — never stack.

## Verify before push

```sh
bun run typecheck && bun run lint && bun test
```

## Push back on

Express/Fastify (stdio only) · Vitest (use `bun test`) · dotenv (Bun native) · pino/winston (in-tree logger intentional) · expanding GH token scopes (see `SECURITY.md`).
