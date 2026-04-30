# Security Policy

## Threat model

context-bridge is an MCP server that exposes GitHub data to an AI assistant. The threat model is shaped by that.

### What we defend against

1. **Token leakage.** The GitHub PAT lives in the server process's env. It must never reach the AI model, the MCP client, structured logs, error responses, or any user-visible surface. The structured logger redacts any field whose key matches `token|password|secret|api_key|authorization|cookie|bearer` at any depth.
2. **Path traversal / injection in tool inputs.** Every tool validates inputs with Zod at the MCP boundary. Repo names, paths, refs, and queries are pattern-checked before reaching Octokit.
3. **Resource exhaustion.** GitHub's API has a 5,000 req/hour limit per token. The cache layer (PR #9) and rate-limit awareness (PR #10) prevent runaway tool loops from burning the budget.
4. **Stale data deception.** Cache entries have explicit TTLs (default 5 minutes). Cached responses are tagged with their `fetched_at` timestamp so consumers can decide whether to trust them.

### What we do NOT defend against

- **Compromise of the host machine.** If an attacker has shell on the box running the MCP server, they have the token. This is a development-tools threat model, not a hardened-server one.
- **Compromise of the AI model.** If the model is prompt-injected into making malicious tool calls, the worst it can do is read GitHub data the token already has access to. There is intentionally no `write_*` tool.
- **Tampered MCP clients.** This server trusts the JSON-RPC client (Claude Code, Cursor, etc.) to be honest. It does not authenticate clients.

## Required token scopes

The minimum scopes for the GitHub Personal Access Token are:

- `repo:read`
- `issues:read`
- `pull_requests:read`

Do **not** grant `repo:write`, `delete_repo`, `admin:org`, or any token that could mutate GitHub state. The server has no code path that writes — a broader-scoped token only enlarges the blast radius if the token leaks.

## Reporting a vulnerability

Email: `chandrabhansingh27d@gmail.com` with subject `[context-bridge security]`.

Please include:
- A description of the issue.
- Steps to reproduce.
- The version (commit SHA or release tag) you observed it on.

Do not file a public issue. We will respond within 72 hours.

## Hardening checklist for self-hosters

- [ ] Token has only read scopes.
- [ ] `.env` / `.env.local` are in `.gitignore` (they are by default).
- [ ] Server runs as an unprivileged user, not root.
- [ ] Logs are written somewhere the AI model cannot read (the logger writes to stderr, which the MCP client does not forward to the model by default).
- [ ] Cache database (`bun:sqlite`, lands in PR #9) lives outside any directory served by another process.
- [ ] If running in CI / shared infra, the token is scoped to a service account, not your personal account.
