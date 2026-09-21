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

## First run — web/
```bash
# prerequisites: api/schema.gql must already exist on disk (build api/ once if it's a fresh clone —
# codegen reads this file directly, it does not need api's dev server, DB or Docker running)
pnpm --dir web install

# env: the apps throw at start-up without VITE_GRAPHQL_URL, and .env.development is gitignored
cp web/packages/app/.env.development.example web/packages/app/.env.development
cp web/packages/admin/.env.development.example web/packages/admin/.env.development

# generate typed GraphQL output from api/schema.gql
pnpm --dir web run codegen

# run it
pnpm --dir web/packages/app run dev    # app on :5173
pnpm --dir web/packages/admin run dev  # admin on :5174

# or build
pnpm --dir web/packages/app run build
pnpm --dir web/packages/admin run build
```
No env file is required for `codegen` on a fresh clone — it defaults to `../api/schema.gql` when
`GRAPHQL_SCHEMA_PATH` isn't set (see `web/codegen.ts`, ADR-0008).

## Web auth pages (KAN-13)
- The API allows browser calls from `CORS_ORIGINS` (comma-separated, default `http://localhost:5173,http://localhost:5174`).
  It is in both API env templates (`api/.env.example`, `api/.env.develoment.example`). If `set-ports.sh`
  moved the web ports, set `CORS_ORIGINS` to the new origins in the API's env.
- `web/packages/app` needs `VITE_GRAPHQL_URL` (copy `.env.development.example`, see "First run — web/") and
  throws at start-up without it. `.env.development` is only read in Vite's dev mode, so a production build has
  no source for it yet — a fork that deploys must supply it at build time.
- There is no email provider (ADR-0011): to finish "Forgot password", run the worker
  (`pnpm --dir api run worker:start:dev`), submit the email on `/auth/forgot-password`, read the token from the
  worker's `[EMAIL] Password reset ...` log line and open `/auth/restore-password?token=<token>`.

## Running two (or more) stacks side by side
Every service's *host-side* port is configurable (ADR-0009) — container-internal ports never change
(3001/5432/6379/5173/5174, fixed in `docker-compose.yml`) — so a second git worktree can run its own full
stack — six services — alongside the first without any port or container-name collision:
```bash
# from the new worktree's directory
../<original-worktree>/move-env.sh "$PWD"   # copy over the populated local env files
./set-ports.sh 4000                          # pick any free base port; derives the *host* ports:
                                              #   EXPOSE_WEB_APP_PORT=4000, EXPOSE_API_PORT=4001,
                                              #   EXPOSE_WEB_ADMIN_PORT=4002, EXPOSE_POSTGRES_PORT=4003,
                                              #   EXPOSE_REDIS_PORT=4004
docker compose -p <a-project-name-per-worktree> up -d
```
Still just `docker compose up -d` (no `-p`) for a worktree that's fine using the default ports
(3001/5432/6379/5173/5174) — nothing changes there if `set-ports.sh` is never run. `web/` now has its own
Docker path too (`web-app`/`web-admin` services, ADR-0009) — `pnpm --dir web/packages/app run dev` still
works standalone if you don't want it in Docker; both read the same `web/packages/*/.env.development`
(Vite's own mode-specific convention — loaded automatically for `vite`/`vite dev`'s default "development"
mode, no `vite.config.ts` change needed).

All six services come up cleanly with a plain `docker compose up -d` (the build-context and Postgres
healthcheck db-name bugs that used to block `api`/`worker` here are fixed — see "Known failures" below).

## Commands
See the command map in `CLAUDE.md` — that is the canonical list.

## Undocumented steps everyone knows
- `schema.gql` regenerates itself on `start:dev`/`build` — you do not run a separate schema codegen step, but you do need the app to boot successfully once for it to update.
- Seed/reference data (roles, admin/dev fixtures) is not part of `prisma migrate` — it runs separately via the `IMigrationItem`s in `api/src/migrations/items/` (all environments) and `api/src/migrations/items.development/` (dev only), triggered by `docker-prisma-migration.sh` or on app boot through `MigrationsModule`.
- `api/.env.test` intentionally leaves `DATABASE_URL` commented out — tests use PGlite (`DATABASE_DIR`), not a real Postgres connection.
- `pnpm --dir web run codegen` needs `api/schema.gql` to exist on disk (build/boot `api/` once on a fresh clone) — it does not talk to a live server, so `api/`'s docker/DB stack doesn't need to be running.

## Known failures

**Fixed by KAN-8** (yarn→pnpm migration): the yarn-shim `test`/`test:e2e` scripts, the four undeclared
runtime deps (`lodash`, `ms`, `keyv`, `@prisma/driver-adapter-utils`), and the mid-migration
`pnpm-workspace.yaml`/`pnpm-lock.yaml`-vs-`yarn.lock` state are resolved — see `ADR-0006`'s "Follow-ups
completed by KAN-8" note. One piece is **not** done: `api/yarn.lock` is still present. The
`guard-dependency-manager` hook blocks any `rm`/`del` command that mentions a lockfile, including the
stale one being retired here, and this session didn't route around it — a human needs to
`git rm api/yarn.lock` directly.

**Fixed by KAN-2** (follow-up, 2026-09-18, outside that ticket's own port-configuration scope but fixed
at the user's explicit request while debugging `docker compose up`): `docker-compose.yml`'s `api`/`worker`
`build.context` now points at `./api` (was `.`, the repo root) — matches `api/Dockerfile`'s `COPY`
expectations, so `docker compose build`/`up` produces a real image without the `docker build -f
api/Dockerfile ./api` workaround KAN-8 and KAN-2 both needed until now. The Postgres healthcheck now
checks `pg_isready -U postgres -d ${DATABASE_NAME:-poc}` (was the literal, wrong `trukkit`) — agrees with
`POSTGRES_DB=poc`, and stays overridable via a `DATABASE_NAME` env var for a fork that renames the
database. `api`/`worker`/`postgres`'s `env_file` now points at `api/.env.development` (was a root-level
`.env.development` that nothing documented how to create) — the existing first-run step's `cp
api/.env.develoment.example api/.env.development` now actually produces the file compose reads, closing
the "still open" row this table used to carry for that mismatch. Verified: a plain `docker compose up -d`
(no flags, no manual `docker build`/`docker run`, and with a real, correctly-populated `api/.env.development`
created via that first-run step) brings up all six services — `api`, `worker`, `postgres` (healthy),
`redis` (healthy), `web-app`, `web-admin` — a real GraphQL call against `api` returned 200, and the worker
connected to Redis cleanly (previously `ECONNREFUSED ::1:6379`/`127.0.0.1:6379` when `REDIS_HOST` was
missing from that file — a reminder that this file needs the *full* shape in `api/.env.development.example`,
not just the port vars from the root `.env.example`, which is a different file for a different purpose —
see ADR-0009).

**Still open** (found while verifying this bootstrap or KAN-8, not fixed — flagging for the team):

| Symptom | Cause | Workaround / fix |
|---|---|---|
| `tsc`/build error `Object literal may only specify known properties, and 'Customers' does not exist`, plus `Property 'customer' does not exist on type 'PrismaService'` at `init.customer.migration.ts:28` | `account.service.ts` writes a `Customers` relation and `init.customer.migration.ts` reads `this.prisma.customer` — no `Customer` model exists anywhere in `api/prisma/models/*.prisma`. | Needs a real fix (either the model was dropped and these call sites weren't updated, or it needs to be added back) — tracked as **KAN-4**. **Bigger than documented**: `MigrationsModule.onModuleInit()` awaits `MigrationsService.runMigrations()`, which runs `InitCustomerMigration` whenever `NODE_ENV` is `local`/`test`/`development` — i.e. every normal dev boot. A rejected `onModuleInit` crashes NestJS bootstrap, so **the app does not start at all** under `pnpm --dir api run start:dev` with the committed `.env` (confirmed KAN-8, 2026-09-17), not just the one e2e test. It also breaks `DataCooker.beforeAll()` (`test/utils/DataCooker/DataCooker.ts:91`) for every suite that uses it, since that unconditionally calls the same `runMigrations()` — confirmed **5 of 10 unit test suites / 46 of 66 tests fail**, and **all 4 e2e suites / 19 of 19 e2e tests fail** (KAN-8 baseline run, unrelated to package manager — same failures occur with the exact dependency versions `yarn.lock` would have installed). |
| 66 `TS18047`/`TS18048` (`'x' is possibly 'null'`/`'undefined'`) errors from `tsc --noEmit` across `*.spec.ts` and `*.e2e-spec.ts` files, plus `test/utils/DataCooker/DataCooker.ts(26,30): error TS2554: Expected 5 arguments, but got 2` (68 total with the 2 Customer-model errors above) | Pre-existing strict-null-check violations and a signature mismatch in test utility code, unrelated to the Customer-model bug and unrelated to the package manager (same TypeScript version, 5.9.3, that `yarn.lock` already pinned). Nobody appears to have run a full `tsc --noEmit` to completion in this environment before (KAN-8 was the first to install cleanly enough to see it). **Caveat:** this count was gathered on host Node v24.16.0, not the pinned 22.16.0 (rule T2 — no local v22 was available in that session); it has not been re-verified on the pinned version. | Needs its own triage pass — likely several small fixes across test files. Not attempted by KAN-8 (out of scope — a mechanical package-manager swap is not the place to fix ~68 unrelated type errors). |
| **Superseded by KAN-7** (see `ADR-0007`): `pnpm --dir api run lint` now runs Oxlint, not ESLint — the linter itself was replaced, this is not a fix to the row below. Real current baseline: **10 errors reported** (with existing `eslint-disable` comments still suppressing violations — Oxlint honors them, verified empirically), **24 unsuppressed** (11 `no-unused-vars`, 12 `ban-ts-comment` — mostly undescribed `@ts-expect-error`/`@ts-ignore`, 1 `no-require-imports`), all pre-existing code-quality issues unrelated to the KAN-7 tool swap. Note the ESLint-era count this row used to cite (60 errors / 5 warnings) was itself already stale before KAN-7 — the real ESLint baseline as installed at the time of the swap was 581 errors / 39 warnings, almost all from type-aware rules (`@typescript-eslint/no-unsafe-*`) that Oxlint doesn't enforce by default (ADR-0007) — so the drop is a rule-set change, not a cleanup. | Same root cause as before: nobody re-ran the full check as dependency versions drifted. | Needs its own triage pass for the remaining violations, including the undescribed `@ts-expect-error`/`@ts-ignore` directives now visible. Not attempted by KAN-7 (out of scope, rule B4/C1). |
| `.github/workflows/agent-checks.yml`'s suppression-comment guard (added by KAN-8) pattern-matches only the literal string `eslint-disable`. **Corrected during KAN-7's self-review**: Oxlint actually honors `eslint-disable`/`eslint-disable-line`/`eslint-disable-next-line` as real suppressions (not ignored, as first assumed), so the guard still functions against every suppression written before KAN-7. The real gap is narrower: it does not *also* match Oxlint's own `oxlint-disable`/`oxlint-disable-line`/`oxlint-disable-next-line` syntax (confirmed via Context7, oxc.rs docs), which a suppression written after KAN-7 might use instead | A future `oxlint-disable` suppression comment could land in a PR without a `WHY:` justification and this CI guard would not catch that specific spelling — a real, currently-open enforcement gap, though the old spelling is still covered | Extend the guard's regex to also include `oxlint-disable`. Not done by KAN-7 — CI/pipeline files are only changed in a dedicated PR with a human reviewer (rule T4). |
| No formatting check remains in the command map after KAN-7 (`ADR-0007`) | Before KAN-7, `eslint-plugin-prettier` surfaced Prettier drift as a `lint` error; that bridge was intentionally dropped (Prettier already runs standalone via `format`), but nothing replaced it as a *check* — `format` is `prettier --write` (a writer), and no `format:check`/`prettier --check` script exists, so unformatted code no longer fails anything in the command map | Add a `format:check` script (`prettier --check ...`) if the team wants formatting enforced again; not added by KAN-7 (out of scope for a linter swap) |

## Release
No release process exists yet — no CI/CD, no staging or production environment is defined in this repo (see `ARCHITECTURE.md`). `.github/workflows/agent-checks.yml` added by this PR only checks PR evidence/bypass hygiene, it does not deploy anything.
