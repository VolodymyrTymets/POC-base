# Agent tooling and MCP policy

> The single source of truth for what the agent may reach in this engagement. Part of the client onboarding conversation.

## Client consent
- AI-assisted development permitted: yes — recorded 2026-09-17, by volodymyr, during `/setup`.
- Restrictions the client asked for: none recorded yet; this is an internal starter base, not a client engagement (see `BUSINESS_MODEL.md`) — revisit this section once a POC is forked for an actual client.

## Active MCP servers
| Server | Purpose | Data it can reach | Scope/permissions | Approved by | Rotate/expire |
|--------|---------|--------------------|--------------------|-------------|---------------|
| context7 | library docs | none (library names only) | read | internal | — |
| serena | code navigation | this repo, locally | read | internal | — |

## Not installed (recommended, needs a human to add)
| Server / plugin | Purpose | Why not on by default |
|------------------|---------|------------------------|
| `prisma@claude-plugins-official` | Prisma-aware DB tooling | Optional convenience; add via `claude plugin install prisma@claude-plugins-official` if the team wants it, then move it into "Active" above. |
| `github@claude-plugins-official` | PRs, issues, CI | Recommended for the `/review-pr` workflow; not installed by `/setup` itself. |

## Forbidden here
- Production databases, production credentials, production deploys (rule C5) — moot today since no production environment exists in this repo yet (see `ARCHITECTURE.md`).
- Any server not listed above.
- Shared service accounts for OAuth servers — each developer authenticates as themselves.

## Notes
- Keep ≤5 active servers per session; disable what the current task does not need.
- Prefer an already-installed CLI over an MCP server when both do the job — a CLI costs no context.
- Secrets only via `${ENV_VAR}` in `.mcp.json`. Never inline.
