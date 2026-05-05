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
- **Compromise of the AI model under read-only mode.** If the model is prompt-injected into making malicious tool calls and `WRITES_ENABLED=false`, the worst it can do is read GitHub data the token already has access to. Under `WRITES_ENABLED=true` the blast radius widens to commenting, labelling, branch creation, and PR opening — but never to closing/merging PRs, pushing the default branch, force-pushing, ref deletion, workflow dispatch, or repo-settings changes (see "Write surface — capability vs authority" below).
- **Tampered MCP clients.** This server trusts the JSON-RPC client (Claude Code, Cursor, etc.) to be honest. It does not authenticate clients.

## Required token scopes

### Read-only mode (default)

| Scope | Purpose |
|-------|---------|
| `repo:read` | repo metadata, file content for `search_code` |
| `issues:read` | `search_issues`, `list_review_comments` |
| `pull_requests:read` | `get_pull_request`, `get_pr_diff` |

### Write mode (`WRITES_ENABLED=true`, opt-in)

| Scope | Purpose |
|-------|---------|
| `issues:write` | `comment_on_issue`, `label_issue` |
| `pull_requests:write` | `comment_on_pr`, `open_pr` |
| `contents:write` | `create_branch`, `commit_files` |

For classic PATs, the umbrella `repo` (or `public_repo` for public-only) covers all three. For fine-grained tokens, grant the specific permissions above against the target repository only.

Do **not** grant `admin:*`, `delete_repo`, `workflow`, or `security_events`. None of those scopes are required by any tool in this server.

## Write surface — capability vs authority

`WRITES_ENABLED=true` grants the server the *capability* to mutate GitHub state, but the tool surface withholds *authority* over destructive or governance operations. The server intentionally exposes only:

| Tool | Action |
|------|--------|
| `comment_on_issue` | post issue comment |
| `comment_on_pr` | post PR top-level comment |
| `label_issue` | add labels to issue/PR |
| `create_branch` | create new ref |
| `commit_files` | atomic multi-file commit to a non-default branch |
| `open_pr` | open pull request |

The server does **not** expose — and refuses to add — tools that:

- close issues, close or merge pull requests,
- push to the default branch (`commit_files` rejects this target explicitly),
- force-push, delete refs, or rewrite history,
- dispatch or re-run workflows,
- modify repository settings, branch protection, or collaborators.

Issues are resolved indirectly: the agent opens a PR with `Closes #N` in the body. A human reviews and merges; the merge auto-closes the issue. The agent never closes anything directly.

The `WRITES_ENABLED` env flag is fail-closed: the default is `false`, and write tools are not registered at all when it is unset. A misconfigured token can never expose write tools because the env flag gates registration before token scope is consulted.

At startup, when `WRITES_ENABLED=true`, the server reads `x-oauth-scopes` from `GET /user`. For classic PATs lacking `repo` or `public_repo`, startup fails fast. For fine-grained tokens (which do not return that header), the assertion is best-effort — actual permission failures surface as 403 from the per-tool calls, mapped to `AUTH_ERROR / insufficient_scope`.

## Reporting a vulnerability

Email: `chandrabhansingh27d@gmail.com` with subject `[context-bridge security]`.

Please include:
- A description of the issue.
- Steps to reproduce.
- The version (commit SHA or release tag) you observed it on.

Do not file a public issue. We will respond within 72 hours.

## Hardening checklist for self-hosters

- [ ] `WRITES_ENABLED` set deliberately. Default `false`.
- [ ] Token scopes match the mode (read-only scopes when `WRITES_ENABLED=false`; minimum write scopes per the table above otherwise).
- [ ] `.env` / `.env.local` are in `.gitignore` (they are by default).
- [ ] Server runs as an unprivileged user, not root.
- [ ] Logs are written somewhere the AI model cannot read (the logger writes to stderr, which the MCP client does not forward to the model by default).
- [ ] Cache database (`bun:sqlite`, lands in PR #9) lives outside any directory served by another process.
- [ ] If running in CI / shared infra, the token is scoped to a service account, not your personal account.
