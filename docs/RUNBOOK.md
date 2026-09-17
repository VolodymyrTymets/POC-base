# Runbook

> How to run this project, and what goes wrong. Written for a human joining on day one — and read by the agent when the environment misbehaves.

## First run
```bash
# prerequisites: Node 22.16.0 (pinned by api/Dockerfile, no .nvmrc exists yet), pnpm 12.x, Docker (for Postgres+PostGIS/Redis)
pnpm --dir api install

# env setup
cp api/.env.example api/.env                       # local, non-docker run
cp api/.env.develoment.example api/.env.development # note: source file is misspelled "develoment"; for docker-compose

# data stores: start
docker compose up -d postgres redis

# migrate + seed (runs Prisma migrations, then the IMigrationItem seed set — rule P4)
pnpm --dir api run prisma-gen
pnpm --dir api run prisma-migrate

# run it
pnpm --dir api run start:dev        # API on :3001
pnpm --dir api run worker:start:dev # background worker
```
Or via Docker for the whole stack: `docker compose up -d --build` (runs `docker-prisma-migration.sh`, which waits for Postgres then runs `prisma migrate deploy` before starting the app).

## Commands
See the command map in `CLAUDE.md` — that is the canonical list.

## Undocumented steps everyone knows
- `schema.gql` regenerates itself on `start:dev`/`build` — you do not run a separate schema codegen step, but you do need the app to boot successfully once for it to update.
- Seed/reference data (roles, admin/dev fixtures) is not part of `prisma migrate` — it runs separately via the `IMigrationItem`s in `api/src/migrations/items/` (all environments) and `api/src/migrations/items.development/` (dev only), triggered by `docker-prisma-migration.sh` or on app boot through `MigrationsModule`.
- `api/.env.test` intentionally leaves `DATABASE_URL` commented out — tests use PGlite (`DATABASE_DIR`), not a real Postgres connection.

## Known failures

**Fixed by KAN-8** (yarn→pnpm migration): the yarn-shim `test`/`test:e2e` scripts, the four undeclared
runtime deps (`lodash`, `ms`, `keyv`, `@prisma/driver-adapter-utils`), and the mid-migration
`pnpm-workspace.yaml`/`pnpm-lock.yaml`-vs-`yarn.lock` state are resolved — see `ADR-0006`'s "Follow-ups
completed by KAN-8" note. One piece is **not** done: `api/yarn.lock` is still present. The
`guard-dependency-manager` hook blocks any `rm`/`del` command that mentions a lockfile, including the
stale one being retired here, and this session didn't route around it — a human needs to
`git rm api/yarn.lock` directly.

**Still open** (found while verifying this bootstrap or KAN-8, not fixed — flagging for the team):

| Symptom | Cause | Workaround / fix |
|---|---|---|
| `tsc`/build error `Object literal may only specify known properties, and 'Customers' does not exist`, plus `Property 'customer' does not exist on type 'PrismaService'` at `init.customer.migration.ts:28` | `account.service.ts` writes a `Customers` relation and `init.customer.migration.ts` reads `this.prisma.customer` — no `Customer` model exists anywhere in `api/prisma/models/*.prisma`. | Needs a real fix (either the model was dropped and these call sites weren't updated, or it needs to be added back). **Bigger than documented**: `MigrationsModule.onModuleInit()` awaits `MigrationsService.runMigrations()`, which runs `InitCustomerMigration` whenever `NODE_ENV` is `local`/`test`/`development` — i.e. every normal dev boot. A rejected `onModuleInit` crashes NestJS bootstrap, so **the app does not start at all** under `pnpm --dir api run start:dev` with the committed `.env` (confirmed KAN-8, 2026-09-17), not just the one e2e test. It also breaks `DataCooker.beforeAll()` (`test/utils/DataCooker/DataCooker.ts:91`) for every suite that uses it, since that unconditionally calls the same `runMigrations()` — confirmed **5 of 10 unit test suites / 46 of 66 tests fail**, and **all 4 e2e suites / 19 of 19 e2e tests fail** (KAN-8 baseline run, unrelated to package manager — same failures occur with the exact dependency versions `yarn.lock` would have installed). |
| 66 `TS18047`/`TS18048` (`'x' is possibly 'null'`/`'undefined'`) errors from `tsc --noEmit` across `*.spec.ts` and `*.e2e-spec.ts` files, plus `test/utils/DataCooker/DataCooker.ts(26,30): error TS2554: Expected 5 arguments, but got 2` (68 total with the 2 Customer-model errors above) | Pre-existing strict-null-check violations and a signature mismatch in test utility code, unrelated to the Customer-model bug and unrelated to the package manager (same TypeScript version, 5.9.3, that `yarn.lock` already pinned). Nobody appears to have run a full `tsc --noEmit` to completion in this environment before (KAN-8 was the first to install cleanly enough to see it). **Caveat:** this count was gathered on host Node v24.16.0, not the pinned 22.16.0 (rule T2 — no local v22 was available in that session); it has not been re-verified on the pinned version. | Needs its own triage pass — likely several small fixes across test files. Not attempted by KAN-8 (out of scope — a mechanical package-manager swap is not the place to fix ~68 unrelated type errors). |
| `pnpm --dir api run lint` reports 60 errors / 5 warnings (`@typescript-eslint/no-unsafe-*`, `no-unused-vars`, `no-floating-promises`, `require-await`) across `src/migrations/**`, `src/notifier/log-notifier.service.ts`, `src/prisma/prisma.adapter.factory.ts`, `src/worker.ts`, and several `test/**/*.e2e-spec.ts` / `test/utils/mock-services/**` files | Pre-existing code-quality violations, confirmed unrelated to KAN-8 — none of the flagged files were touched by the yarn→pnpm migration. Same "nobody ran the full check before" pattern as the `tsc` findings above. | Needs its own triage pass. Not attempted by KAN-8 (out of scope). |
| `docker compose build`/`up` fails or silently misresolves — `context: .` in `docker-compose.yml`'s `api`/`worker` services points at the repo root, but `api/Dockerfile`'s `COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./` (and `COPY . .`) expect those files at the build-context root, which is `api/`, not the repo root. | `docker-compose.yml` was never actually exercised end-to-end (consistent with everything else in this "known failures" list) — the context should be `./api` (with `dockerfile: api/Dockerfile` if the compose file needs to stay at the repo root), or `docker-compose.yml` should move into `api/`. Not fixed by KAN-8 — unrelated to the package manager. Verified instead with a direct `docker build -f api/Dockerfile ./api`. | Point each service's `context` at `./api`. |
| `docker compose up` fails with `env file /.../.env.development not found` | `docker-compose.yml`'s `env_file: .env.development` resolves relative to the compose file's own location (repo root), but the documented first-run step (above) creates `api/.env.development`, not a root-level one. | Either move/symlink the env file to the repo root, or change `docker-compose.yml`'s `env_file` to `api/.env.development`. Not fixed by KAN-8. |
| Postgres healthcheck in `docker-compose.yml` checks `pg_isready -U postgres -d trukkit` (not `poc` as previously documented here — corrected 2026-09-17), while `api/.env.development`'s `POSTGRES_DB` is `poc` | Leftover naming inconsistency (this repo was repurposed from a project called "Trukkit"/"POC" into the generic `poc-base`); the healthcheck was never updated to match. | Pick one database name and make `.env.development`/`docker-compose.yml` agree. Not fixed by KAN-8. |

## Release
No release process exists yet — no CI/CD, no staging or production environment is defined in this repo (see `ARCHITECTURE.md`). `.github/workflows/agent-checks.yml` added by this PR only checks PR evidence/bypass hygiene, it does not deploy anything.
