# ADR-0005 — BullMQ background jobs as a separate Nest application

- **Date:** 2026-09-17 (recorded retroactively — not re-litigated)
- **Status:** accepted
- **Deciders:** recorded from existing code during `/setup`
- **Ticket:** —

## Context
Some work (e.g. sending an OTP SMS) must not block the GraphQL request/response cycle.

## Decision
Background jobs run in a **separate Nest application**, not in-process with the API: `nest-cli.json`
declares a second project (`worker`, entry `apps/worker/worker`, root `apps/worker`... in practice
`src/worker.ts`), built via `pnpm --dir api run worker:build` and run via `worker:start:dev` /
`worker:start:prod`. Jobs are queued with `@nestjs/bullmq` (Redis-backed); `src/background-workers/`
holds the job modules, currently just `sms-sender`.

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| In-process job execution (e.g. `setTimeout`, fire-and-forget promise) | Explicitly disallowed by `backend-core.md` rule 20 — no business-critical work outside a real queue. |
| A separate service/language for workers | Unnecessary complexity for a POC base; same codebase, same Prisma models, just a second Nest entrypoint. |

## Consequences
- Positive: OTP delivery (and future jobs) can retry independently of API request lifecycles; `docker-compose.yml` runs `worker` as its own container.
- Accepted cost: two processes to keep running locally and in any future deployment; Redis is now also queue infrastructure, not just a cache (see `ARCHITECTURE.md` — flushing Redis drops in-flight jobs, not just cache entries).
- Follow-ups: no dead-letter path or retry/backoff policy was found configured on the `sms-sender` queue — confirm before relying on delivery guarantees (`backend-core.md` rule 20).

## Revisit when
Job volume or isolation needs outgrow a single worker process (e.g. per-queue scaling).
