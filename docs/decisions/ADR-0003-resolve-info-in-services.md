# ADR-0003 — Pass `GraphQLResolveInfo` into service read methods (deviation from strict transport isolation)

- **Date:** 2026-09-17 (recorded retroactively — not re-litigated)
- **Status:** accepted
- **Deciders:** recorded from existing code during `/setup`
- **Ticket:** —

## Context
The generic backend rule (`.claude/rules/backend-core.md` rule 1) says business logic must not know how
it was called — no `req`, `res`, or GraphQL `context` below the transport layer, so a use case can serve
any transport. This repo's read services deliberately violate that rule in one specific way.

## Decision
GraphQL resolvers pass `@Info() info: GraphQLResolveInfo` down into service read methods (e.g.
`AccountService.getAccountById(id, info)`), which call `getPrismaIncludeFromGqInfo(info)`
(`api/src/common/GraphToPrisma.ts`) to build a Prisma `select` that matches exactly the fields the
client asked for, and `infoToPrismaCashingConfig(info)` to key the Redis cache (ADR-0001). This is the
repo's actual mechanism against both overfetching and N+1-by-relation — it replaces the generic
DataLoader pattern described in `.claude/rules/api-graphql.md` rule 9.

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| Strict transport isolation (services take plain typed args only) | Would require either overfetching every field on every read, or a parallel DataLoader per relation. Not what the existing code does; changing it is a repo-wide refactor, not a drive-by fix. |
| Per-relation DataLoader (the generic GraphQL rule) | Solves N+1 but not overfetching; would duplicate what field-selection already solves here. Could be introduced later for genuinely hot relations, but not as a wholesale replacement without an ADR. |

## Consequences
- Positive: one mechanism handles both field-selection and cache-keying; no per-relation loader boilerplate.
- Accepted cost: service methods are not transport-agnostic — they cannot be reused as-is by a REST controller or a background job without reworking the `info` parameter. New code should not extend this exception to `context`, `req`, or `res` (CLAUDE.md rule S2).
- Follow-ups: none identified yet.

## Revisit when
A non-GraphQL consumer (REST endpoint, worker, CLI) needs to call the same read logic — at that point, extract the transport-agnostic core and keep the `info`-based optimization as a thin GraphQL-only wrapper.
