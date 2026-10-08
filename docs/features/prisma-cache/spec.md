# prisma-cache — keep Date and Bytes types on a Redis cache hit

Port of apiko-dev/valere-poc PR #55 (`fix(POC-7.3)`, merged).

## Problem
`PrismaExtensionRedis` (`api/src/prisma/prisma.caching.ts`) stores query results with plain
`JSON.stringify`/`JSON.parse` (no `transformer` set). On a cache **hit** a `Date` comes back as an ISO string,
a `Buffer` (`File.content`) as `{ type, data }` — and `Decimal`/`BigInt` would too. A **miss** returns the real
types, so services fail only "from time to time" (valere-poc: `from.getTime is not a function`,
`offerAmount.toNumber is not a function`). Tests never see it: `NODE_ENV=test` has no Redis
(`prisma.module.ts` returns a plain `PrismaService`).

## Goal / business value
BUSINESS_MODEL goals 1 and 3: the base a new POC forks must not carry a latent cache bug, and the test base
must be able to exercise a cache hit.

## Scope
- in: `cacheTransformer` (tags and rebuilds `Date`, `Decimal`, bytes, `BigInt`), wired into `prisma.caching.ts`;
  a unit spec for it; a `cacheHits` option for e2e that routes reads through the same transformer; one e2e
  regression spec against a cached read in this repo; one line in `docs/ARCHITECTURE.md`.
- **out (explicit):** a real RedisJSON run (local compose Redis lacks RedisJSON); flushing or versioning
  existing cache entries (they expire in 60 s + 30 s stale); any Valere-specific code (`ValereE2eApp`, company /
  register specs — rule G2); changing TTLs or the cached models; removing the `superjson` comment is part of the port.

## Acceptance criteria
- [x] AC1 `cacheTransformer` round-trips `Date`, `Decimal`, `Buffer`, `bigint`, plain values, nested arrays/null unchanged.
- [x] AC2 `prisma.caching.ts` sets `transformer: cacheTransformer`.
- [x] AC3 With every read replayed through the cache transformer (`cache-hit-prisma.ts`), `AccountService.getAccountById` returns `Date` columns as `Date`s and the GraphQL `account { createdAt }` query succeeds; both specs fail with plain JSON and pass with the transformer. Bytes are proven by the unit spec only (`File.content` is not reachable through a cached GraphQL read in this repo).
- [x] AC4 Existing unit and e2e suites unchanged in result (baseline recorded first, B2).
- [x] AC5 typecheck, lint: no new errors vs baseline.

## Edge cases
| Case | Expected behaviour | Decided by |
|------|--------------------|-----------|
| Stale pre-deploy cache entries (plain JSON) | still parse as strings until TTL expires; documented, not handled | PR #55 |
| A user object that has a `$cacheType` + `value` key | would be misread as tagged; accepted, key is namespaced | assumed |
| `Decimal` | the repo has no Decimal column today; covered by the unit spec only | assumed |

## Open questions
| # | Question | My assumed answer | Needs a human? |
|---|----------|-------------------|----------------|
| 1 | Jira ticket ID for branch/commit (rule A1/A5); `prisma-cache` is not a `KAN-n` | needs an ID | **yes** |
| 2 | Which cached read does the e2e regression use? | `file` read of `content`/`publicUrl` (Bytes) and an account `Date` field — confirm the services use `PRISMA_FACTORY` with `withRedis: true` | no |
| 3 | Does the `transformer` option exist in the installed `prisma-extension-redis` version? | yes (it is the commented-out block here); verify via Context7 / installed source (D4) | no |
