# ADR-0001 — Use Prisma as the ORM, with a Redis-backed read cache

- **Date:** 2026-09-17 (recorded retroactively — not re-litigated)
- **Status:** accepted
- **Deciders:** recorded from existing code during `/setup`
- **Ticket:** —

## Context
The API needs typed database access to PostgreSQL (with PostGIS) and a way to keep hot GraphQL reads fast
without every service hand-rolling its own caching.

## Decision
Prisma is the ORM (`api/prisma/`, code split across `models/*.prisma`, client generated to
`api/generated/prisma/`). Services that serve GraphQL reads extend `PrismaCashingService`
(`api/src/common/prismacashing.service.ts`) and obtain a Prisma client through `getPrismaService(config)`
backed by `ioredis` (via `prisma-extension-redis`), rather than injecting `PrismaService` directly for
every read.

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| TypeORM / Drizzle | Not evaluated in-repo; Prisma was already in place when this was recorded. |
| No caching layer | Left every read to hit Postgres directly; rejected in favor of the current pattern. |

## Consequences
- Positive: fast repeated reads for identical field selections; one place (`PrismaCashingService`) to reason about cache invalidation.
- Accepted cost: Redis becomes a second thing that can be stale; the caching config is coupled to `GraphQLResolveInfo` (see ADR-0003).
- Follow-ups: none identified yet.

## Revisit when
The caching layer causes a stale-read bug in production, or a second ORM is seriously proposed.

## Amendment (KAN-1, 2026-09-18)
`@keyv/redis` and `cacheable` were never part of this decision's actual caching path — they backed a
separate, unused `@nestjs/cache-manager` `CacheModule` registration in `app.module.ts` that nothing ever
injected. KAN-1 removed that dead module and both packages. The client this ADR describes has always
been `ioredis`, corrected above; no behavior changed.

## Amendment (KAN-14, 2026-10-08)
The cache stored results as plain JSON, so a cache hit returned `Date` as an ISO string and a `Buffer` as
`{ type, data }` while a miss returned the real types. `cacheTransformer`
(`api/src/prisma/prisma.cache-transformer.ts`, wired through `prisma.caching.ts`) now tags `Date`, `Decimal`,
bytes and `BigInt` on the way in and rebuilds them on the way out. Entries written before the deploy stay plain
JSON until their TTL (60 s + 30 s stale) expires. Ported from valere-poc PR #55. Tests have no Redis, so
`test/utils/e2e-services/cache-hit-prisma.ts` replays every read through the same transformer.
