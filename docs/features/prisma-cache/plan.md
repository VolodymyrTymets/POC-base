# prisma-cache — implementation plan

<!-- A human writes this line to approve. -->
Approved-by: volodymyr · 2026-10-08

Pattern followed: valere-poc PR #55 (`prisma.cache-transformer.ts`), wired through the existing commented
`transformer` slot in `api/src/prisma/prisma.caching.ts`. Test override follows `PRISMA_FACTORY` /
`PrismaAdapterMockFactory` use in `api/test/auth/sign-in.e2e-spec.ts`. No new pattern → no ADR; ADR-0001 gets
an amendment line instead.

## Contract changes
None (no GraphQL, DB or shared-type change). Cache entry format changes: old entries read as strings until TTL.

## Requirements (ordered, one commit each)

### R0 — Baseline (S)
On `main`: unit run, e2e run, `tsc`, lint counts. Evidence for B2. No files.

### R1 — cacheTransformer + unit spec (S)
- files: `api/src/prisma/prisma.cache-transformer.ts` (new), `api/src/prisma/prisma.cache-transformer.spec.ts` (new)
- layer: infrastructure (prisma module)
- test: the spec — Date, Decimal, Buffer, bigint, plain values round-trip
- executed how: unit jest for that file (fails first with no module, then passes)
- risk: the port must satisfy D3 (no unchecked casts; `this: Record<string, unknown>` and `json as unknown` are widening, not escape hatches)

### R2 — wire into caching config (S)
- files: `api/src/prisma/prisma.caching.ts` (change: `transformer: cacheTransformer`, drop the dead SuperJSON comment)
- test: covered by R3; typecheck proves the `CacheConfig.transformer` signature fits
- executed how: `tsc --noEmit`; then a real boot with Redis (see R3)

### R3 — cache-hit e2e + regression spec (M)
- files: `api/test/utils/e2e-services/cache-hit-prisma.ts` (new helper: `PRISMA_FACTORY` override whose `create()` returns `new PrismaService(adapterFactory).$extends` query hook that runs `deserialize(serialize(result))`), `api/test/<file|account>/cached-reads.e2e-spec.ts` (new)
- test: reads a Bytes (`File.content`→`publicUrl`) and a Date field with the override on; fails before R2's transformer is applied (swap in plain JSON to show failing-then-passing, B5), passes after
- executed how: e2e jest command from CLAUDE.md; plus start `redis` via compose and run a GraphQL query twice against `start:dev` to see a real hit (RedisJSON absence may block → report under Not verified)
- risk: the app currently fails to boot (KAN-4 `Customer` landmine) and 5/10 unit + 4/4 e2e suites fail at baseline — if still true, R3's e2e cannot run; per B4 stop and report rather than work around

### R4 — docs (S)
- `docs/ARCHITECTURE.md` Redis line, `docs/decisions/ADR-0001` amendment, spec ACs ticked

## Docs to update in this PR
- [ ] docs/features/prisma-cache/spec.md (ACs checked)
- [ ] docs/ARCHITECTURE.md — Redis line mentions the transformer
- [ ] docs/decisions/ADR-0001 — amendment (cache stores typed values)

## Risks
| Risk | Impact | Cheapest way to find out early |
|------|--------|-------------------------------|
| KAN-4 boot/test breakage blocks e2e (R3) and any real-run proof (B1) | cannot verify; B4 stop | R0 baseline run first |
| `transformer` option shape differs in installed `prisma-extension-redis` | type error / silent ignore | read installed d.ts + Context7 before R2 |
| No RedisJSON locally, so no real hit | B1 only partly met | try plain redis with `type: 'STRING'`? out of scope; list under Not verified |

## Assumptions
- Ticket ID supplied by the human (spec Q1); branch `fix/<TICKET>-prisma-cache`.
- Test helper is generic (no Valere naming); fixtures built with `e2e` Prisma directly.
