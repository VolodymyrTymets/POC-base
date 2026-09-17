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

## Known failures (found while verifying this bootstrap, not yet fixed — flagging for the team)

| Symptom                                                                                                                                                                                                           | Cause                                                                                                                                                                                                                                                        | Workaround / fix |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---|
| `pnpm --dir api run test` / `run test:e2e` throws `SyntaxError` from `node_modules/.bin/jest`                                                                                                                     | The declared script runs `node node_modules/.bin/jest ...` directly; pnpm's `.bin` shims are POSIX shell, not JS, so `node` fails to parse them. This is npm/yarn-shim-specific and breaks under pnpm.                                                       | Run `NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config ./test/jest.json` (or `jest-e2e.json`) instead — verified working. Longer-term, `api/package.json`'s `test`/`test:e2e` scripts need updating for pnpm. |
| `pnpm --dir api run build` / `start:dev` fails with `Cannot find module 'keyv'` / `'ms'` / `'lodash'` / `'@prisma/driver-adapter-utils'`                                                                          | These are imported in `src/` but not declared in `api/package.json`'s `dependencies`/`devDependencies`. They resolved by accident under yarn's hoisting (`api/yarn.lock` is now stale); pnpm's strict `node_modules` linking exposes only declared packages. | Add the four packages to `api/package.json` and re-run `pnpm --dir api install`. Not done as part of this bootstrap PR — out of scope, flagged for a follow-up. |
| `tsc`/build error `Object literal may only specify known properties, and 'Customers' does not exist`; e2e test failure `Cannot read properties of undefined (reading 'count')` at `init.customer.migration.ts:28` | `account.service.ts` writes a `Customers` relation and `init.customer.migration.ts` reads `this.prisma.customer` — no `Customer` model exists anywhere in `api/prisma/models/*.prisma`.                                                                      | Needs a real fix (either the model was dropped and these call sites weren't updated, or it needs to be added back). Not fixed as part of this bootstrap PR — flagged as a known landmine. |
| Postgres healthcheck in `docker-compose.yml` checks `pg_isready -U postgres -d poc`, but `api/.env.example` defaults to a database named `poc`                                                                    | Leftover naming inconsistency (this repo was repurposed from a project called "POC" into the generic `poc-base`).                                                                                                                                            | Pick one database name and make `.env`/`docker-compose.yml` agree before relying on the Docker healthcheck. |
| `api/pnpm-workspace.yaml` and `api/pnpm-lock.yaml` are new/untracked while `api/yarn.lock` is still present and referenced by `api/README.md`/`api/Dockerfile`                                                    | Mid-migration from yarn to pnpm (human decision recorded in ADR-0006: pnpm is canonical going forward).                                                                                                                                                      | Commit the pnpm files, remove `api/yarn.lock`, and update `api/README.md`/`api/Dockerfile` to use pnpm — not done as part of this bootstrap PR. |

## Release
No release process exists yet — no CI/CD, no staging or production environment is defined in this repo (see `ARCHITECTURE.md`). `.github/workflows/agent-checks.yml` added by this PR only checks PR evidence/bypass hygiene, it does not deploy anything.
