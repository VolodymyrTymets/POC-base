---
description: Backend rules that hold whatever the framework is - NestJS, Express or Fastify - and whatever the API style is. Layering, transport isolation, validation boundary, errors, transactions, queries, auth, logging, jobs.
paths:
  - "api/src/**"
  - "api/**/*.service.ts"
  - "api/**/*.repository.ts"
---

# Backend rules (framework-agnostic)

These hold for NestJS, Express and Fastify alike. The framework file next to this one adds mechanics; it never overrides these.

## Transport isolation (the rule the others depend on)

1. **Business logic must not know how it was called.** No `req`, `res`, `reply`, `next`, `HttpException` or status code below the transport layer. A use case takes plain typed arguments and returns plain data or throws a domain error. *Why: this is the whole reason the same use case can serve a REST route, a GraphQL resolver and a queue consumer — and the reason it is testable without a server.* **Confirmed exception for this repo**: `GraphQLResolveInfo` is passed into service read methods for field-selection and caching — see CLAUDE.md rule S2 and ADR-0003. Do not extend the exception beyond that.
2. **Layering:** resolver → service → `PrismaService`/`PrismaCashingService` → Prisma. Skipping a layer needs an ADR.
3. The transport layer is thin: parse input, call one use case, map the result. If a handler is longer than ~15 lines, logic has leaked into it.
4. Feature boundaries: a feature module (`src/<feature>/`) may import another feature's service through its exported provider, never a sibling's internal file directly.

## Input and output boundary

5. **Every input is parsed into a typed shape at the boundary** before it reaches a service — `class-validator` DTOs in `dto/`. Unknown fields are rejected, not forwarded.
6. **Never return a persistence entity to the outside.** Map to the GraphQL entity type. Never leak `hash`, `salt`, `otpHash`, `refreshToken`, `deleted` or other users' data.
7. Config is validated once at boot and injected via `@nestjs/config` / `ConfigService`. `process.env` appears only in the bootstrap/config module.

## Errors and async

8. Services throw **domain errors** using the constants in `src/common/errors.ts`, wrapped in the appropriate Nest exception (`UnauthorizedException`, etc.) at the point they cross into the resolver.
9. Errors are never swallowed. No empty `catch`, no `catch { return null }` without a logged reason (rule D5).
10. **No floating promises.** Every promise is awaited or explicitly handled; no `async` callback passed to `forEach`.

## Data

11. **Multi-write operations run in one transaction** (`prisma.$transaction`), and the transaction boundary lives in the service.
12. Every list is **paginated** with explicit field selection (`getPrismaIncludeFromGqInfo`) and a stable sort. No unbounded list, anywhere.
13. A query inside a loop is an **N+1 bug**, not a style issue. Batch it or use a DataLoader.
14. Raw SQL requires a `// WHY:` and bound parameters. String-concatenated SQL is a security defect.
15. Schema changes ship as forward migrations with a rollback note; applied migration files are immutable; migrations run against local databases only (rules C3, C5). See the `db-migration` skill.

## Security

16. Authentication by default: a publicly reachable operation is an explicit, visible exception (no `@UseGuards(GqlAuthGuard)` at all).
17. Authorization at the boundary **and** ownership re-checked in the service. This repo layers `GqlAuthGuard` → `RoleGuard`/`@Roles` → a per-record `*AssertService` (rule P3).
18. Never trust a client-supplied ID, filter, sort field or include for authorization or for building a query — allowlist them.

## Operations

19. Structured logging (`Logger`) with enough context to trace a request. No `console.log`. No tokens, passwords, full request bodies or PII (SSN, DOB, phone) in logs.
20. Background jobs (BullMQ, `src/background-workers/`) are idempotent and retried with backoff.
21. Graceful shutdown on SIGTERM: stop accepting, drain in-flight work, close the pool.

## Tests

22. Unit tests with `DataCooker` against a real PGlite database (rule P5) — never mock Prisma. Integration/e2e through the real Nest app with `supertest`.

## Code organization

23. **No loose functions in a resolver or service file.** Every piece of logic that lives in `*.resolver.ts`/`*.service.ts` is a method on that resolver's/service's class — never a module-level `function` declared alongside it, even a small, pure helper with no dependencies of its own. Keeps everything constructor-injectable and mockable the same way (rule 1), and keeps the class the one unit of reuse per file instead of a class plus a loose export. A helper that logically belongs to a class becomes a method on it (`private` if nothing outside the class calls it), not a sibling function in the same file.

## Verification (rule B1)

A backend change is done only when the operation was **actually called** — a GraphQL operation against a running server, or an e2e test through the real transport — with the real response captured in the evidence block. A passing unit test is not verification of an endpoint.