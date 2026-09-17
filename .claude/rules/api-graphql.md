---
description: GraphQL API rules - schema as a versionless contract, field-selection against N+1, mandatory pagination, field-level authorization, resolver/mutation naming, error masking.
paths:
  - "api/**/*.graphql"
  - "api/**/*.gql"
  - "api/**/*.resolver.ts"
  - "api/schema.gql"
---

# GraphQL API rules

## The schema is the contract

1. The schema is the product's public API and it is **versionless**. Design it, review it, and treat every change as permanent once a client exists.
2. **Fields are deprecated, never removed** while any client might still request them: `@deprecated(reason: "use X, removal after <date>")`.
3. Nullability is a design decision, not a default. Mark a field non-null only when it can never legitimately be absent — a non-null field that resolves to an error nulls out its entire parent object.
4. Mutations model **one user intent** each and return the mutated entity (rule below on naming), so the client cache can update itself.
5. Expected, actionable failures should be modeled explicitly where the client needs to branch on them; reserve thrown errors (mapped to `UnauthorizedException`/etc. via `src/common/errors.ts`) for authentication/authorization/not-found failures.

## Resolvers and naming (confirmed convention)

6. **Resolvers are thin**: authorize via guards, delegate to a service, map the result. No Prisma calls in a resolver body (backend-core rule 1/2).
7. **Query naming**:
   - `<EntityName>` — a single entity, `id` required.
   - `<EntityName>s` — a list, `pagination` required, `filter`/`search`/`sort` optional.
   - `<EntityName>sById` — a list by ids, `ids: [ID!]!` required plus the list parameters above.
   - Anything else — `<EntityName><EdgeCase>`.
8. **Mutation naming**:
   - `create<EntityName>(input: Create<EntityName>Input!)`
   - `update<EntityName>(id: ID!, input: Update<EntityName>Input!)`
   - `delete<EntityName>(id: ID!)` — a soft delete (rule P2), never a hard delete.
   - Every mutation **returns the affected entity**.
9. **Field-selection instead of DataLoader for relations**: read services pass `@Info() info: GraphQLResolveInfo` down from the resolver and call `getPrismaIncludeFromGqInfo(info)` so Prisma only selects requested fields, combined with `PrismaCashingService`/`getPrismaService(...)` for Redis-backed caching. This is the repo's actual N+1/overfetch mitigation — do not introduce a second, competing DataLoader layer without an ADR.
10. **Authorization is per field where it matters** — a field exposing another account's data (e.g. `AccountProfile.SSN`) needs its own check, not an inherited one from the parent query.
11. Resolver return types use the generated Prisma types / GraphQL entity classes — no `any` in a resolver (rule D3).

## Server configuration

12. Depth limit, cost/complexity limit and a query timeout are not currently configured in `GraphQLModule.forRoot` — flag this as a gap before this API takes untrusted public traffic, do not silently add one as a drive-by change.
13. Introspection and the playground must be disabled in production before real client traffic; verify this in `app.module.ts` rather than assuming it.
14. Errors are masked in production: internal messages and stack traces must never reach the client. `src/common/errors.ts` constants are the stable, client-facing vocabulary.
15. Subscriptions only when polling genuinely cannot work — none exist today; the first one needs an ADR.

## Types and schema generation

16. **This API is code-first**: `schema.gql` is generated automatically by `GraphQLModule.forRoot({ autoSchemaFile: ... })` at boot from the `@Resolver`/`@ObjectType`/`@InputType` decorators. Never hand-edit `schema.gql` — change the decorators and let Nest regenerate it (`pnpm --dir api run start:dev` regenerates it on save).
17. There is no client-side codegen yet (no consuming frontend). When `web/` lands and starts consuming this schema, wire `graphql-codegen` and land the schema change plus every consumer in the same PR (see the `api-contract` skill).

## Verification (rule B1)

Run the **real operation** against the running server for the happy path and one failure:

```bash
curl -sS http://localhost:3001/graphql -H 'content-type: application/json' \
  -d '{"query":"query{ account { id AccountProfile { phoneNumber } } }"}'
```
Evidence must state the operation, the response, and — for any new relation field — confirm it uses `getPrismaIncludeFromGqInfo` rather than resolving in a loop.