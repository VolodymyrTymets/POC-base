# ADR-0006 — pnpm is the dependency manager, replacing yarn

- **Date:** 2026-09-17
- **Status:** accepted
- **Deciders:** volodymyr (confirmed during `/setup`)
- **Ticket:** —

## Context
At the time of `/setup`, the repo had a tracked `api/yarn.lock` (referenced by `api/README.md` and
`api/Dockerfile`) alongside a newly added, untracked `api/pnpm-lock.yaml` and `api/pnpm-workspace.yaml` —
a mid-migration state with no clear signal of which was canonical. The agent's command map (rule T3)
needs exactly one answer.

## Decision
pnpm is canonical going forward. `api/pnpm-lock.yaml` and `api/pnpm-workspace.yaml` already exist in the
working tree (pre-existing, uncommitted); they belong in their own PR alongside removing `api/yarn.lock`,
not in this config-only bootstrap PR (rule A4 — one PR, one requirement). The command map in `CLAUDE.md`
uses `pnpm --dir api <script>` throughout regardless of when that companion PR lands.

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| yarn (matches the existing `README.md`/`Dockerfile`) | Explicitly not chosen — pnpm was already in progress and preferred by the human. |

## Consequences
- Positive: pnpm's strict `node_modules` linking surfaces phantom dependencies immediately (it already did — see `docs/RUNBOOK.md`'s known failures) rather than letting them resolve by accident.
- Accepted cost: switching surfaced real breakage — undeclared runtime deps (`lodash`, `ms`, `keyv`, `@prisma/driver-adapter-utils`) and a yarn-shim-specific `test` script — that must be fixed in application code, not by this PR (out of scope, see RUNBOOK).
- Follow-ups (not done here, flagged for the team): remove `api/yarn.lock`, add the missing dependencies to `api/package.json`, add a `packageManager` field, update `api/README.md` and `api/Dockerfile` to use pnpm.

### Follow-ups completed by KAN-8 (2026-09-17)
`packageManager` field and `api/pnpm-workspace.yaml` added; `lodash`, `ms`, `keyv` and
`@prisma/driver-adapter-utils` declared as dependencies (this is the approval basis for that addition —
rule C2); `api/pnpm-lock.yaml` committed; `api/Dockerfile` (via corepack, with a self-update to work around
`node:22.16.0-alpine`'s bundled corepack predating pnpm 12's bin layout), `api/README.md` and
`api/launch.sh` updated to pnpm; the yarn-shim-specific `test`/`test:e2e`/`test:debug` scripts fixed to run
directly under pnpm. **Not completed:** `api/yarn.lock` removal — blocked by the
`guard-dependency-manager` hook, which treats deleting any lockfile (including the stale one being
retired) as blocked; needs a human to run `git rm api/yarn.lock` directly. See `docs/RUNBOOK.md`.

## Revisit when
Never, unless the team explicitly decides to move back to yarn/npm — this ADR is the record of that not happening by accident again.
