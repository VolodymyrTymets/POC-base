# ADR-0002 — GraphQL-first API (code-first), no REST surface

- **Date:** 2026-09-17 (recorded retroactively — not re-litigated)
- **Status:** accepted
- **Deciders:** recorded from existing code during `/setup`
- **Ticket:** —

## Context
The service needs a client-facing API. NestJS supports REST controllers and GraphQL resolvers equally
well; the codebase needed to pick one as the primary surface.

## Decision
GraphQL, via `@nestjs/graphql` + Apollo (`GraphQLModule.forRoot`, code-first, `autoSchemaFile:
'./schema.gql'`). Every feature module exposes a `*.resolver.ts`; `AppController` exists only for a
single placeholder `/test` route and is not a real REST surface.

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| REST (schema-first with Swagger) | Not used; would need its own DTOs/Swagger decorators and a different `api-rest.md` rule set. Revisit only with an ADR if a REST surface becomes genuinely needed (e.g. webhooks). |

## Consequences
- Positive: one query can fetch exactly the shape a client needs; schema is generated from code so resolver and schema cannot drift silently.
- Accepted cost: `schema.gql` is versionless once a real client exists (see `.claude/rules/api-graphql.md`); no depth/cost limiting or persisted queries are configured yet (flagged in `ARCHITECTURE.md`).
- Follow-ups: add query depth/cost limits and disable introspection before any production/public traffic.

## Revisit when
A consumer genuinely needs a REST/webhook surface (e.g. a third-party webhook receiver that can't speak GraphQL).
