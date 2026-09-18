# ADR-0009 — Configurable ports for running multiple stacks side by side

- **Date:** 2026-09-18
- **Status:** accepted
- **Deciders:** volodymyr (plan approval), agent (design + verification)
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
One base `PORT`, given to `set-ports.sh <BASE_PORT>` (repo root, sibling to `move-env.sh`), derives five
named variables — `WEB_APP_PORT=BASE`, `API_PORT=BASE+1`, `WEB_ADMIN_PORT=BASE+2`, `POSTGRES_PORT=BASE+3`,
`REDIS_PORT=BASE+4` — and writes them into the local, gitignored env files that already exist for each
piece (`./.env` for docker-compose's own `${...}` interpolation, `api/.env`, `web/packages/app/.env`,
`web/packages/admin/.env`). `api/.env` needs more than just its own `PORT` rewritten: the *local,
non-docker* `api` also dials Postgres and Redis directly over `localhost:<port>`, so `set-ports.sh`
rewrites `REDIS_PORT` there too and the port embedded inside `DATABASE_URL` (via a small in-place
substitution, not a full rewrite, since the rest of that URL — user, password, db name — isn't this
script's to touch). Missed on the first pass (caught by `/review-pr`'s self-review): without it, a second
worktree's non-docker `api` would silently keep talking to the *first* worktree's database and
Redis/BullMQ queue instead of its own. `docker-compose.yml`'s `container_name` is removed from every
service so
Compose's own per-project auto-naming (`<project>-<service>-1`) prevents a Docker-daemon-wide name
collision, which port changes alone do not fix.

Container-internal ports for `api`/`postgres`/`redis` stay fixed (3001/5432/6379) — only the host-side
mapping varies (`"${API_PORT:-3001}:3001"`). Postgres/Redis's official images can't be told to change
their internal listen port without extra image work, and `api/src/main.ts` already reading
`process.env.PORT` was left alone to keep this ticket's blast radius small. `web/`'s new `web-app`/
`web-admin` compose services (new `web/Dockerfile`, dev-server-only, same base+leaf-target shape as
`api/Dockerfile`) instead vary **both** sides together (`"${WEB_APP_PORT:-5173}:${WEB_APP_PORT:-5173}"`),
since Vite's own listen port was already being made configurable for the local (non-docker) `pnpm dev`
case — reusing that one mechanism for the container case too is simpler than inventing a second,
fixed-internal-port scheme just for symmetry with the other three services. Vite's `server.host: true` is
what actually makes the container's dev server reachable through that host mapping at all; without it, a
Vite server bound to its default `127.0.0.1` is unreachable from outside its own container regardless of
how the port is published.

`web-app`/`web-admin` bind-mount `./web` over the image's `/usr/src/app` (with anonymous volumes over
each `node_modules` directory, so the container's own linux-native `pnpm install` isn't shadowed by the
host's tree) — without this, "dev server, HMR" would be false: each container would just be a frozen
`COPY . .` snapshot from build time, and editing source on the host would change nothing running.
`env_file` on those two services is `required: false`, since a fresh clone has no local
`web/packages/*/.env` yet and Compose otherwise refuses to bring up *any* service, not just these two,
on a missing `env_file` — the container's own listen port comes from an `environment:` block driven by
the same var as the host-side mapping instead, so `env_file` only carries `VITE_*` values now, with
nothing load-bearing left to diverge.

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| Independent named vars per service, set by hand, no base-port/offset behavior | Doesn't match the ticket's literal "PORT=3000 → api=3001" example; confirmed with the human during planning that the offset-from-one-base behavior was wanted |
| Fixed internal port for `web-app`/`web-admin` too, host-only mapping (matching `api`/`postgres`/`redis`) | Would need a second env var per web app (one for the container-internal Vite port, one for the host mapping) for no real benefit, since Vite's port is already configurable either way |
| Dockerizing `web/` with a production/nginx build stage | Bigger than this ticket; `api/Dockerfile` itself has no distinct `production` stage despite a `start:prod` script existing, so dev-server-only keeps `web/Dockerfile` at the same scope |
| Fixing the pre-existing, unrelated `docker-compose.yml` bugs hit while verifying this (build `context: .` vs. `api/Dockerfile`'s expected root; `env_file: .env.development` resolving to a repo-root file nothing creates; the `trukkit`-vs-`poc` Postgres healthcheck db name) | Unrelated to ports; already tracked in `docs/ARCHITECTURE.md`'s landmines. Worked around for this ticket's own verification (direct `docker build`/`docker run`, matching KAN-8's precedent) rather than fixed |

## Consequences
- Positive: two (or more) full stacks — six services each — run concurrently on one machine without any
  manual file surgery beyond running `move-env.sh` + `set-ports.sh` once per new worktree; verified live
  against a genuinely running third, unrelated peer-session stack throughout this ticket's own work.
- Positive: `web/` gets a first Docker path (dev-server only), closing the gap between it and `api/`.
- Accepted cost: `docker ps`/`docker logs api` no longer show the bare service name — now
  `<project>-api-1` — since `container_name` was removed. No script or doc in this repo referenced the
  bare name as of this ticket.
- Accepted cost: `docker compose up -d` alone still cannot bring up `api`/`worker` end-to-end on this
  machine, because of the two pre-existing, unrelated bugs named above — this ticket's own verification
  used the same `docker build -f api/Dockerfile ./api` + `docker run` workaround KAN-8 already documented,
  not a fix.
- Follow-ups: KAN-4 (Customer-model bug) and the `docker-compose.yml` build-context/env-file/db-name
  landmines in `docs/ARCHITECTURE.md` remain open, tracked there, not by this ADR.

## Revisit when
`web/` gains a real production build target (a client fork needs to deploy it), or the pre-existing
`docker-compose.yml` build-context/healthcheck bugs get fixed, at which point re-verify `docker compose up
-d` works for the full default stack with no manual workaround.
