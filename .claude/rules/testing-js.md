---
description: JS/TS testing mechanics on top of the core testing rules - NestJS test module, PGlite-backed integration tests, GraphQL operation tests.
paths:
  - "api/**/*.spec.ts"
  - "api/**/*.e2e-spec.ts"
  - "api/test/**"
  - "api/jest.setup.js"
---

# JS/TS testing mechanics

Core `testing.md` decides *what* to test and at which level. This file is *how*, in this ecosystem.

## Backend

1. **NestJS** — `Test.createTestingModule` for unit tests, `AppModule` + `supertest` for e2e, both against a real database via `DataCooker` (see `.claude/skills/test-conventions/SKILL.md`) — never a mocked repository or a mocked Prisma client.
2. **This repo uses PGlite (in-memory Postgres with PostGIS), not docker/testcontainers**, as its disposable database — that deviates from the generic JS/TS rule of "real disposable database via docker/testcontainers" on purpose, for test speed. `DataCooker` runs the real Prisma migrations against it per suite.
3. Run tests with `NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config ./test/jest.json` (unit) or `./test/jest-e2e.json` (e2e) — **not** `pnpm --dir api run test`; that declared script invokes `node node_modules/.bin/jest` directly, which breaks under pnpm's POSIX-shell `.bin` shims (see RUNBOOK known failures).
4. Mock only true externals with Jest spies (`NotifierService`, S3, Twilio-equivalent) — never the database.

## GraphQL

5. Test **operations** through `supertest` against `/graphql`, not resolver functions in isolation — this exercises the resolver, the service, and the field-selection logic together.
6. Assert on `response.body.errors[0].extensions?.originalError?.message` / `.code`, not on brittle message text where avoidable.
7. A new relation field gets a test that confirms it doesn't resolve per-parent-item (rule 9 in `api-graphql.md` — field-selection via `getPrismaIncludeFromGqInfo`, not a query-per-row).

## Determinism

8. Seeded data via `DataCooker`; clean up what a test inserts. No `waitFor` with a fixed delay — wait for a condition. Re-running until green is a rule B3 violation.