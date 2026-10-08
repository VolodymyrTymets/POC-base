# TEST-SYNC — port valere-poc test-base fixes into poc-base

Ticket: **none given** (assumed id `TEST-SYNC`; a Jira key is needed for branch/commit names, rule A5).

## Problem
`poc-base` is the source fork for POCs (goal 3: the test base must keep working). `valere-poc` hardened it in
three merged PRs; poc-base has none of that. Measured on `main` today (2026-10-08): full e2e run = 4 of 8
suites / 20 of 44 tests fail, `Exceeded timeout of 5000 ms for a hook` in `beforeAll` (each suite replays every
Prisma migration + seeds, ~3 s, and parallel workers starve each other).

Source PRs (read via `gh`): #27 hook timeout fix · #49 migrated-template DB load · #51 rename.

## Scope
1. **#27**: e2e `testTimeout`; `DataCooker.beforeEach/afterEach` use jest fake timers (`doNotFake` nextTick,
   setImmediate, setTimeout, clearTimeout); every e2e spec calls them; sleeps for token expiry become
   `jest.setSystemTime(...)`; `waitReady` after `PGlite.create`; quieter logging.
2. **#49**: `MigratedTemplate` builds migrated+seeded PGlite once, dumps it to `os.tmpdir()` (atomic lock dir,
   name keyed by hash of `prisma/migrations` + `src/migrations`); `DataCooker.beforeAll` loads it via
   `loadDataDir`; `afterAll` tolerates a failed `beforeAll`; e2e `maxWorkers` 2, `workerIdleMemoryLimit`;
   `listenOnLoopback` replaces `app.init()` in e2e specs (macOS stray-port 301/404/503 flake).
3. **#51**: `DataCooker`→`TestDatabase` (`ITestDatabase`), template class→`MigratedTemplate`
   (`IMigratedTemplate.getDump()`), `getPgLitle`→`getPGlite`, variable `dataCooker`→`testDatabase`, docs renamed.

## Acceptance criteria
- [ ] Full e2e run on this machine: 8/8 suites pass, no hook timeout, twice in a row
- [ ] Unit run (`jest.json`) no worse than baseline (recorded in R0)
- [ ] No `DataCooker`/`dataCooker`/`getPgLitle` left outside `docs/features/KAN-*` history
- [ ] Editing a migration or seed item makes the next run rebuild the template (hash key)
- [ ] Docs/rules/skill use the new names and describe the template (E1)

## Edge cases
- Stale `.lock` dir after a killed run → documented recovery (delete the lock dir) in test-conventions
- poc-base `MigrationsService` takes 5 services (valere's takes 2) → template build must construct them
- Template shared across `jest.json` and `jest-e2e.json` runs, same hash, same file — fine
- Seeded data is part of the template, so suites see roles/admin/dev customer as before

## Out of scope
valere-only items: `SiteFixtures`, dashboard specs, `fixtures.removeAll()`; fresh DB per test; CI; fixing
`tsc` baseline errors or the Oxlint baseline; new runtime deps (C2: none needed).

## Open questions (assumed answers)
1. Jira key? — assume none exists; branch `chore/TEST-SYNC-...` until human supplies one.
2. Edit `CLAUDE.md` (P5) and `.claude/**`? Both are "ask first" — assume yes, approval of this plan covers them.
3. Port `testTimeout` as 30000 (#49's final value, supersedes #27's 20000) — assumed yes.
