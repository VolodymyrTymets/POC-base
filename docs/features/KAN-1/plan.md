# KAN-1 — implementation plan

<!-- A human writes this line to approve. Until it is here, guard-plan-approval blocks writes to code.
     A deliberate exception is written the same way, with its reason:
     Approved-by: spike, no review — KAN-1 -->
Approved-by: volodymyr · 2026-09-18

Pattern followed: `docs/decisions/ADR-0007-oxlint-linter.md` (the precedent for reasoning about which
lint suppressions are dead vs. live after a tooling change, and for scoping a cleanup to what's provably
safe rather than a blanket sweep) and `docs/decisions/ADR-0006-pnpm-dependency-manager.md` (the precedent
for removing a dependency cleanly via the package manager, never by hand-editing the lockfile).

## Contract changes
- boundary: none — no GraphQL schema, resolver or DTO changes.
- data: none.
- generated output: `api/pnpm-lock.yaml` regenerates via `pnpm --dir api install` after the `package.json`
  edit (rule T3 — never hand-edited).

## Requirements (ordered, each independently verifiable)

### R1 — Remove the unused `@nestjs/cache-manager` cache layer (S)
- files:
  - `api/src/app.module.ts` (change: remove the `CacheModule` import and its `registerAsync(...)` block,
    and the now-unused `Keyv`/`KeyvRedis`/`CacheableMemory` imports)
  - `api/package.json` (change: remove `@nestjs/cache-manager`, `cache-manager`, `keyv`, `@keyv/redis`,
    `cacheable`)
  - `api/pnpm-lock.yaml` (generated: `pnpm --dir api install`)
- layer: application bootstrap module (`AppModule`) — not a feature module, no service/resolver layers
  touched.
- test: no new test needed — this removes dead code with no behavior (nothing ever injected
  `CACHE_MANAGER`, confirmed by repo-wide grep in planning). Existing unit/e2e suites are the regression
  check.
- executed how: `pnpm --dir api install` (confirms no other package still needs these five as transitive
  deps), then boot the API for real (`docker compose up -d postgres redis` + `pnpm --dir api run
  start:dev`) and run one GraphQL operation that goes through `PrismaCashingService`'s cached path twice
  in a row — confirm the second call logs `[SQL Caching] for: ...` (proves the *real* Redis cache in
  `PrismaCashingService` still works, unaffected by removing the dead `CacheModule`).
- risk: low — five packages with a single, unused call site. Residual risk: if the API doesn't currently
  boot cleanly for an unrelated reason, the "real GraphQL call" verification step degrades to
  typecheck + build only, noted as unverified in the PR.

### R3 — Full workspace verification (S)
- files: none — this is a verification-only step covering both R1 and R2 together (`AC5`).
- layer: n/a.
- test: n/a.
- executed how: run, and capture real output for, all four in sequence: `pnpm --dir api exec tsc
  --noEmit`, `pnpm --dir api run lint`, `pnpm --dir api run build`, and
  `NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config ./test/jest.json`. Compare
  each against the pre-change baseline captured before R1/R2 land — no new failures is the bar, not zero
  failures (the repo has pre-existing, documented baseline issues per `docs/RUNBOOK.md`).
- risk: none — this step only observes.

### R2 — Delete the dead `eslint-disable` comments (S)
- files (only the lines suppressing `@typescript-eslint/no-unsafe-return`, `no-unsafe-call`,
  `no-unsafe-assignment` or `no-unsafe-member-access` — none of these rules exist in
  `api/.oxlintrc.json`'s active rule set, confirmed during planning):
  - `api/src/decorators/current-account.decorator.ts` (1 comment)
  - `api/src/auth/strategies/jwt-refresh.strategy.ts` (1 comment)
  - `api/src/common/pagination.service.ts` (3 of its 5 comments — the 2 guarding `ban-ts-comment` /
    `no-unused-vars` stay, out of scope)
  - `api/src/common/prismacashing.service.ts` (14 of its 22 comments — the 8 guarding `ban-ts-comment`
    stay, out of scope)
- layer: none — comment-only deletions, zero behavior change.
- test: none needed (no behavior change). Verification is that lint output is unchanged.
- executed how: `pnpm --dir api run lint` before and after — output must be byte-identical (same 10
  suppressed + 24 unsuppressed baseline from `docs/RUNBOOK.md`'s known-failures table; the dead
  comments were never suppressing anything, so removing them cannot change what Oxlint reports).
- risk: none, given the rule-by-rule cross-check against `.oxlintrc.json` already done in planning — but
  the before/after lint diff is the actual proof, not the cross-check alone.

## Docs to update in this PR
- [ ] `docs/features/KAN-1/spec.md` (acceptance criteria checked off)
- [ ] `docs/ARCHITECTURE.md` — not structurally changed by this ticket; no edit needed
- [ ] `docs/DOMAIN_GLOSSARY.md` — no new domain terms
- [ ] `docs/decisions/ADR-NNN` — not needed; this removes dead code per an existing pattern, it doesn't
      establish a new one
- [ ] PR body notes (not a doc edit): the follow-up ticket for the 13 live `eslint-disable` comments, and
      the stale "Customer model" landmine row in `docs/RUNBOOK.md`/`docs/ARCHITECTURE.md` found while
      investigating this ticket (the bug no longer reproduces — `tsc --noEmit` shows none of its errors,
      `init.customer.migration.ts` now uses `AccountService`/`AccountProfileService` correctly) — filed
      per rule E2 rather than fixed here, since it's unrelated to this ticket's scope (rule C1).

## Risks
| Risk | Impact | Cheapest way to find out early |
|------|--------|-------------------------------|
| A package thought unused turns out to be a transitive dep of something else | `pnpm install` fails or something else breaks at runtime | `pnpm --dir api install` right after the `package.json` edit, before touching anything else |
| The app doesn't boot for a reason unrelated to this change, blocking the "real GraphQL call" verification for R1 | Can't fully satisfy rule B1 for this PR | Try the boot early (before writing the diff) so a blocker is known up front, not discovered at verification time |
| Local Node is v24.16.0, not the pinned v22.16.0 | Verification runs on an unpinned runtime | Proceed per prior team precedent (see repo history / KAN-8), note the caveat in the PR evidence block |

## Assumptions
- "Redundant" in the ticket means "not on any live code path," not "unpopular" — confirmed by grep, not
  guessed, for both the cache layer and the dead lint comments.
- The follow-up ticket for the 13 live `eslint-disable` comments will be filed by the user/team after this
  PR, not by this agent (no Jira write access assumed beyond what's already used for lookup).
