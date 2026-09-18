# ADR-0009 — Configurable ports for running multiple stacks side by side

- **Date:** 2026-09-18
- **Status:** accepted
- **Deciders:** volodymyr (plan approval, port-naming redesign, build-context/healthcheck fixes), agent
  (design + verification)
- **Ticket:** KAN-2

## Context
This repo is regularly developed from more than one git worktree at once (`move-env.sh`, already on
this branch before KAN-2, exists specifically to copy local env files into a new worktree). Every port
the codebase uses was hardcoded: `docker-compose.yml` mapped `api`→3001, `postgres`→5432, `redis`→6379
with a fixed `container_name` per service, and `web/packages/app`/`web/packages/admin`'s `vite.config.ts`
pinned 5173/5174. A second worktree's `docker compose up` or `pnpm dev` cannot run alongside the first —
verified during this ticket's own implementation, since a peer session's stack was genuinely occupying
the default ports throughout. `web/` itself also had no Docker path at all, so "run the codebase in two
or more separate Docker Compose containers" (the ticket's own framing) was incomplete without one.

## Decision
Every service's **container-internal port is fixed and never changes**: `api`→3001, `postgres`→5432,
`redis`→6379, `web-app`→5173, `web-admin`→5174, all hardcoded in `docker-compose.yml`. Only the
**host-side, externally-reachable port** varies between two stacks, via one `EXPOSE_<SERVICE>_PORT`
variable per service (`EXPOSE_API_PORT`, `EXPOSE_POSTGRES_PORT`, `EXPOSE_REDIS_PORT`,
`EXPOSE_WEB_APP_PORT`, `EXPOSE_WEB_ADMIN_PORT`), each read via Compose's `${VAR:-default}` interpolation
so an unset var reproduces today's exact defaults. `container_name` is removed from every service so
Compose's own per-project auto-naming (`<project>-<service>-1`) prevents a Docker-daemon-wide name
collision, which port changes alone don't fix.

`set-ports.sh <BASE_PORT>` (repo root, sibling to `move-env.sh`) derives all five `EXPOSE_*` values from
one base port (`EXPOSE_WEB_APP_PORT=BASE`, `EXPOSE_API_PORT=BASE+1`, `EXPOSE_WEB_ADMIN_PORT=BASE+2`,
`EXPOSE_POSTGRES_PORT=BASE+3`, `EXPOSE_REDIS_PORT=BASE+4`) and writes them into the root, gitignored
`.env` that Compose reads for interpolation. `api/.env` (the *local, non-docker* `pnpm --dir api run
start:dev` path — a different mode from the container, with no fixed-internal-port concept of its own)
also gets updated: its own `PORT`, plus `REDIS_PORT` and the port embedded inside `DATABASE_URL`, since
outside Docker the api process dials Postgres/Redis directly over `localhost:<host-port>`, which just
changed. The `DATABASE_URL` rewrite is a small in-place substitution of just the port segment, not a full
rewrite — the rest of that URL (user, password, db name) isn't this script's to touch. Missed on the
first implementation pass (caught by `/review-pr`'s self-review): without it, a second worktree's
non-docker `api` would silently keep talking to the *first* worktree's database and Redis/BullMQ queue.
`web/packages/{app,admin}/.env` also get their own `WEB_APP_PORT`/`WEB_ADMIN_PORT` (a separate, plainly-
named var from the compose-side `EXPOSE_*` ones) plus `VITE_GRAPHQL_URL` pointed at the derived api port —
these drive the *local* `pnpm dev` case, where (unlike the container) there is no fixed internal port and
Vite's own listen port genuinely needs to move.

The `EXPOSE_*` prefix is deliberate, not cosmetic: it's a different variable from `api/.env`'s own
`REDIS_PORT` (client-connection setting) or `web/packages/app/.env`'s `WEB_APP_PORT` (local dev-server
setting) — same underlying number, different meaning, different consumer. Naming them differently closes
a real footgun a first pass of this design had: a shell that happens to export `REDIS_PORT` (e.g. from
sourcing `api/.env`) can no longer silently override Compose's host-port interpolation for an unrelated
purpose.

`web-app`/`web-admin` bind-mount `./web` over the image's `/usr/src/app` (with anonymous volumes over
each `node_modules` directory, so the container's own linux-native `pnpm install` isn't shadowed by the
host's tree) — without this, "dev server, HMR" would be false: each container would just be a frozen
`COPY . .` snapshot from build time, and editing source on the host would change nothing running. Their
`env_file` is `required: false`, since a fresh clone has no local `web/packages/*/.env` yet and Compose
otherwise refuses to bring up *any* service, not just these two, on a missing `env_file` — the
container's own fixed listen port (5173/5174) comes from an explicit `environment:` block instead, so
`env_file` only carries `VITE_*` values, with nothing load-bearing left to diverge from a stale local
`.env`.

Two more pre-existing, unrelated `docker-compose.yml` bugs — hit while verifying this ticket's own port
work, then fixed at the user's explicit request afterward, once a real `docker compose up -d` failure
surfaced them concretely:
- `api`/`worker`'s `build.context` was `.` (repo root); `api/Dockerfile`'s `COPY` instructions expect
  `api/` as the context root. Now `context: ./api`.
- The Postgres healthcheck checked a database named `trukkit`, left over from before this repo was
  renamed to `poc-base`, while every env file sets `POSTGRES_DB=poc` — the healthcheck never passed, so
  `api`/`worker` never reached "healthy" via `depends_on`. Now `pg_isready -U postgres -d
  ${DATABASE_NAME:-poc}` — works out of the box, stays overridable for a fork that renames the database.
- `api`/`worker`/`postgres`'s `env_file` now points at `api/.env.development` (was a root-level
  `.env.development` that nothing documented how to create) — the existing first-run step (`cp
  api/.env.develoment.example api/.env.development`) now produces the exact file Compose reads.

With all three fixed, a plain `docker compose up -d` — no flags, no manual `docker build`/`docker run` —
brings up all six services for real, which the two-stack proof below relies on.

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| Independent named vars per service, set by hand, no base-port/offset behavior | Doesn't match the ticket's literal "PORT=3000 → api=3001" example; confirmed with the human during planning that the offset-from-one-base behavior was wanted |
| `web-app`/`web-admin` vary host **and** container-internal port together (this ADR's first revision) | Simpler at first (reused Vite's already-configurable port for both cases), but inconsistent with `api`/`postgres`/`redis` and fragile — an early implementation actually had one of the two services' internal port hardcoded and the other interpolated, a real bug caught mid-review. Fixing the internal port for all five services the same way removed the inconsistency entirely, at the cost of one extra `environment:` line per web service. |
| Dockerizing `web/` with a production/nginx build stage | Bigger than this ticket; `api/Dockerfile` itself has no distinct `production` stage despite a `start:prod` script existing, so dev-server-only keeps `web/Dockerfile` at the same scope |
| Leaving the build-context/healthcheck-db-name/env-file-location bugs alone (this ticket's original position) | Reasonable to leave unrelated bugs alone in principle, but became untenable in practice: this ticket's own verification needed a manual `docker build`/`docker run` workaround for *every* check involving `api`/`worker`, and the moment a human tried the ticket's own documented workflow (`docker compose up`), all three bugs surfaced as real, blocking failures — fixed at that point rather than left for a future ticket |

## Consequences
- Positive: two (or more) full stacks — six services each — run concurrently on one machine with a single
  `./set-ports.sh <BASE>` per worktree; verified live with two of this session's own stacks running
  concurrently (`kan-2` and `kan-2-second` projects), every endpoint in both answering a real request, no
  port or container-name collisions.
- Positive: `web/` gets a first Docker path (dev-server only, real HMR via bind mount), closing the gap
  between it and `api/`.
- Positive: `docker compose up -d` alone now brings up the entire default stack — the build-context,
  healthcheck-db-name, and env-file-location bugs that used to force a manual `docker build`/`docker run`
  workaround for every verification in this ticket are fixed.
- Accepted cost: `docker ps`/`docker logs api` no longer show the bare service name — now
  `<project>-api-1` — since `container_name` was removed. No script or doc in this repo referenced the
  bare name as of this ticket.
- Follow-ups: KAN-4 (Customer-model bug, unrelated to any of the above) remains open, tracked separately
  in `docs/ARCHITECTURE.md`.

**Addendum (2026-09-18, same day, user request):** `web/packages/{app,admin}/.env` renamed to
`.env.development` (and the tracked `.env.example` templates to `.env.development.example`), matching
`api/`'s existing `.env`/`.env.development` split and, more importantly, Vite's own native
mode-specific env file convention — `loadEnv(mode, envDir, '')` in `vite.config.ts` already resolves
`.env.development` automatically when `mode` is `development` (the default for `vite`/`vite dev`), so
this needed no `vite.config.ts` change at all, just updating every other reference to the old filename
(`docker-compose.yml`'s `env_file`, `set-ports.sh`'s write targets, `move-env.sh`'s copy list). Verified:
`pnpm run dev` picks up `WEB_APP_PORT` from the renamed file with zero config changes; the Docker path
(`env_file: web/packages/app/.env.development`) does too. `web/.gitignore`'s negation only excepted the
exact name `.env.example`, so the new `.env.development.example` was silently swallowed by `.env.*` until
a second negation line (`!.env.development.example`) was added — the same class of gap the root
`.gitignore` was fixed for earlier in this ticket, just missed in `web/`'s copy at the time.

## Revisit when
`web/` gains a real production build target (a client fork needs to deploy it).
