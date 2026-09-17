# KAN-8 — Replace yarn with pnpm

## Problem
`api/` is mid-migration between yarn and pnpm (ADR-0006): `CLAUDE.md`'s command map already assumes
pnpm, but `api/yarn.lock`, `api/Dockerfile`, `api/README.md` and `api/launch.sh` still reference yarn,
there is no `api/pnpm-lock.yaml`/`api/pnpm-workspace.yaml` in the tree, and pnpm's strict linking exposes
dependencies (`lodash`, `ms`, `keyv`, `@prisma/driver-adapter-utils`) that only worked by accident under
yarn's hoisting. A developer following the command map today cannot actually install, build, or boot the
app with pnpm.

## Goal / business value
Serves ranked goal 1 (project scaffolding, `BUSINESS_MODEL.md`) — a new POC forked from this base must be
installable and runnable on the first try with the one dependency manager the repo declares (rule T3).

## Scope
- in: make pnpm the only working dependency manager for `api/` — lockfile, `packageManager` field,
  `Dockerfile`, `README.md`, `launch.sh`, the two yarn-shim-specific jest scripts, and the missing
  declared dependencies pnpm's strict linking requires to boot.
- **out (explicit):**
  - The unrelated `Customers`/`Customer` model bug (`account.service.ts` / `init.customer.migration.ts`)
    — a pre-existing data-model bug, already tracked as a landmine in `ARCHITECTURE.md`/`RUNBOOK.md`,
    confirmed broken under `tsc`/`build`/the `sign-in-otp` e2e test regardless of package manager. Fixing
    it is bigger than this ticket (rule B4) and not caused by the yarn→pnpm switch.
  - The Postgres database-name mismatch (`trukkit` vs. `poc`) and the `docker-compose.yml`
    build-context/env-file path mismatches found while verifying this ticket — see `RUNBOOK.md` — unrelated.
  - Any new runtime dependency beyond the four already-imported-but-undeclared ones (rule C2).
  - CI workflow changes (`.github/workflows/agent-checks.yml` doesn't reference yarn — confirmed by grep).

## Acceptance criteria
- [x] AC1 (partial) `api/pnpm-lock.yaml` + `api/pnpm-workspace.yaml` committed, `packageManager` field
      added. **`api/yarn.lock` removal not done** — the `guard-dependency-manager` hook blocks any
      rm/del command touching a lockfile, including the stale one being retired; needs a human to run
      `git rm api/yarn.lock`.
- [x] AC2 No remaining `yarn` references in `api/Dockerfile`, `api/README.md`, `api/launch.sh`, or
      `api/package.json` scripts — all replaced with the pnpm equivalent. Verified by grep.
- [x] AC3 The four undeclared runtime deps (`lodash`, `ms`, `keyv`, `@prisma/driver-adapter-utils`) added;
      `pnpm --dir api install` and `pnpm --dir api run build`/`tsc --noEmit` no longer report any missing
      module — remaining errors are the pre-existing, unrelated landmines below.
- [ ] AC4 **Blocked, not this ticket's fault.** `pnpm --dir api run start:dev` does not boot the app —
      confirmed the pre-existing `Customers`/`Customer` bug (below) crashes NestJS bootstrap itself
      (`MigrationsModule.onModuleInit()` → `InitCustomerMigration`, under `NODE_ENV=local`), independent
      of pnpm. Both the `development` and `worker` Docker images build and start their `pnpm install`
      cleanly (see AC5), which is as far as pnpm-specific verification can go.
- [x] AC5 (build only) Both `docker build -f api/Dockerfile --target development` and `--target worker`
      succeed end-to-end (install, `prisma generate`). Actual process boot not verified — same blocker as
      AC4.
- [ ] AC6 **Blocked, not this ticket's fault.** `pnpm --dir api run test` runs directly (fixed, see AC8),
      but 5 of 10 suites / 46 of 66 tests fail — all traced to the same pre-existing Customer-model bug via
      `DataCooker.beforeAll()`. Confirmed identical failure count before and after this PR's dependency
      changes (no new regressions).
- [ ] AC7 **Blocked, not this ticket's fault — bigger than assumed.** All 4 e2e suites / 19 of 19 e2e tests
      fail, not just `sign-in-otp.e2e-spec.ts` as originally assumed in OQ1 — same root cause.
- [x] AC8 `api/package.json`'s `test`/`test:e2e`/`test:debug` scripts now work when invoked via
      `pnpm --dir api run test` / `run test:e2e` directly — verified, same pass/fail counts as the
      `pnpm exec jest --config ...` form.

**Follow-up:** the `Customers`/`Customer` model bug (blocks app boot + most of the test suite, see
`docs/RUNBOOK.md`) is already tracked as **KAN-4**. The `docker-compose.yml` build-context/env-file
mismatches found while verifying this ticket (also `docs/RUNBOOK.md`) have no ticket yet — both out of
scope here per rule B4/C1.

## Edge cases
| Case | Expected behaviour | Decided by |
|------|--------------------|-----------|
| `pnpm install` resolves a different transitive version than yarn did for an existing dep | Acceptable as long as build/tests still pass; do not pin unless something breaks | assumption |
| Docker build stage still says `RUN yarn install` | Must be updated in the same PR — the Docker image is a real consumer of the package manager choice | ticket scope |

## Open questions
| # | Question | My assumed answer | Needs a human? |
|---|----------|-------------------|----------------|
| OQ1 | Does "tests pass" (AC) mean literally zero failures, including the pre-existing, unrelated Customer-model bug? | No — that bug is a separate, already-documented landmine (rule B4); "tests pass" means no *new* failures vs. today, and the one known failure stays known | yes — confirm in plan approval |
| OQ2 | Local host Node is v24.16.0, but `api/Dockerfile` pins 22.16.0 and no local v22/nvm/volta is available (rule T2: stop and report, don't work around it) | Verify app boot/tests via `docker compose up -d --build` (uses the pinned image) rather than the bare host `pnpm --dir api run start:dev`, so evidence is collected on the correct runtime | yes — confirm in plan approval |
