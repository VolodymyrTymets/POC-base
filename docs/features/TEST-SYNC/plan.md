# TEST-SYNC — implementation plan

<!-- A human writes this line to approve. -->
Approved-by: volodymyr · 2026-10-08

Pattern followed: valere-poc `main` (`api/test/utils/{TestDatabase,MigratedTemplate}`,
`e2e-services/listen-on-loopback.ts`), adapted to poc-base's 5-arg `MigrationsService`. Local precedent being
replaced: `api/test/utils/DataCooker/DataCooker.ts`. No new pattern vs. the repo's PGlite approach (P5) → no
ADR; ARCHITECTURE/RUNBOOK/skill updated instead.

## Contract changes
None (API, DB, shared types). Test-utility public names change (rename) — every consumer in the same PR.

## Requirements (ordered, one commit each)

### R0 — Baseline (S)
Record on `main`: unit run, e2e run (4/8 suites failing, already captured in scratchpad), `tsc` and lint counts.
Evidence for B2/B5. No files.

### R1 — #27: timeouts and fake timers (S)
- the timeout is headroom only; R2 is the root-cause fix (say so in the PR body)
- files: `api/test/jest-e2e.json` (`testTimeout` 30000), `DataCooker.ts` (`waitReady`, `beforeEach`/`afterEach`
  fake timers, the migration-replay logging is dropped with the replay, `@jest-environment node` header), 8 `api/test/**/*.e2e-spec.ts`
  (call `beforeEach`/`afterEach`; `sign-in-otp` and `refresh-token` sleeps → `jest.setSystemTime`)
- test: the 8 e2e suites; the expiry tests prove the clock move works
- executed: `jest --config ./test/jest-e2e.json` (CLAUDE.md e2e command)
- note: `jest-e2e.json` and `api/test/**` are not protected paths; no `WHY:` needed, nothing weakened (B3) —
  the timeout raise is the ported fix, stated in the PR body

### R2 — #49: migrated template (M)
- files: `api/test/utils/MigratedTemplate/{MigratedTemplate,IMigratedTemplate}.ts` (new, final names from the start so R3 renames nothing here), `DataCooker.ts`
  (`loadDataDir` from dump, drop its own migration reader, null-safe `afterAll`), `jest-e2e.json`
  (`maxWorkers` 2, `workerIdleMemoryLimit` 1500MB)
- no verbatim copy (D3): narrow errors with `error instanceof Error && 'code' in error` instead of `as NodeJS.ErrnoException`; `log(message: string)` is typed
- build step constructs `AccountRoleService`/`AccountService`/`AccountProfileService`/`FileAssertService` as
  today's `beforeAll` does, then `runMigrations()`
- test: e2e + unit; rebuild proof: delete the tmp template file, confirm the next run rebuilds it, and that
  a changed hash input (a throwaway edit to a seed item, reverted) yields a new file name
- executed: run e2e twice (cold: builds; warm: loads ~0.5 s); run unit suite (also uses DataCooker)
- risk: two worker processes racing the lock → covered by the atomic `mkdir` lock ported as-is

### R3 — #51: rename (M, mechanical)
- `git mv` `DataCooker/`→`TestDatabase/`, `IDataCooker`→`ITestDatabase`, `getPgLitle`→
  `getPGlite`; `dataCooker`→`testDatabase` in ~18 specs (8 e2e + 10 unit)
- test: `tsc --noEmit` error count equal to R0 baseline (a stale name shows as a new error); full unit + e2e
- executed: same runs; `grep -rIn "DataCooker\|dataCooker\|getPgLitle" api` returns nothing

### R4 — loopback listen (S)
- files: `api/test/utils/e2e-services/listen-on-loopback.ts` (new), 8 e2e specs: `app.init()` → `listenOnLoopback(app)`
- test/executed: e2e twice in a row, 8/8 each

### R5 — docs (S)
- `docs/ARCHITECTURE.md` (rows at lines 14, 45), `docs/RUNBOOK.md` (template cache + stale-lock note),
  `api/README.md:37`, `CLAUDE.md` P5, `.claude/rules/{testing-js,backend-core,backend-nestjs}.md`,
  `.claude/skills/test-conventions/SKILL.md` (rename + "The migrated template" section + lock troubleshooting).
  `docs/features/KAN-*` keep old names (history). `.claude/**` and `CLAUDE.md` are ask-first → edits need
  the hook confirmation

## Risks and cheapest experiment
1. Template hash/seed differences: poc-base seeds an `InitCustomerMigration` (dev) — a stale template could
   hide seed changes. Experiment: cold run after deleting `/tmp/poc-valery-pglite-*.tar`; assert seed rows exist.
2. Fake timers + JWT expiry change test semantics (sleep → `setSystemTime`). Experiment: run the two expiry
   tests alone, and confirm they fail if the clock move is removed.
3. `workerIdleMemoryLimit`/`maxWorkers` tuned to valere's 8 GB machine. Experiment: two full e2e runs here;
   untested on a CI/2-core runner (not verified).

## Docs and estimate
Docs in R5, same PR (E1). Total: S+S+M+M+S+S. One PR, draft, branch `chore/TEST-SYNC-port-test-base`.
