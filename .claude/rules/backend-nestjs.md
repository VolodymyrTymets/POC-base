---
description: NestJS-specific mechanics on top of backend-core - modules, DI, ValidationPipe, exception filters, guards, interceptors, testing module.
paths:
  - "api/nest-cli.json"
  - "api/**/*.module.ts"
  - "api/**/*.controller.ts"
  - "api/**/*.guard.ts"
  - "api/**/*.interceptor.ts"
  - "api/**/*.filter.ts"
  - "api/**/*.pipe.ts"
  - "api/**/*.decorator.ts"
  - "api/**/main.ts"
---

# NestJS mechanics

Read `backend-core.md` first — this file only adds what is specific to Nest.

1. **DI only.** No `new SomeService()`, no module-level mutable singletons, no service locator. Constructor injection with an interface/token where the dependency crosses a feature boundary (e.g. `PRISMA_FACTORY`).
2. **Module boundaries are the public API.** A feature module (`src/<feature>/<feature>.module.ts`) exports only what siblings may use.
3. **Global `ValidationPipe`** is registered in `main.ts` with `whitelist: true` only — `forbidNonWhitelisted` and `transform` are **not** set. Extra fields are silently stripped rather than rejected, and DTOs are not auto-coerced (e.g. a numeric string arrives as a string). Do not assume `transform` behaviour in new code; raising this to `{ whitelist: true, forbidNonWhitelisted: true, transform: true }` is a deliberate, repo-wide change and needs an ADR, not a drive-by fix.
4. Request/response DTOs are classes with `class-validator` decorators in `dto/`. Never bind a raw object or `any` as a mutation input.
5. **Never return the Prisma entity directly.** Map to the GraphQL `*Entity` class in `entities/` (core rule 6).
6. Domain errors map to Nest exceptions (`UnauthorizedException`, etc.) using the constants in `src/common/errors.ts`.
7. Config via `@nestjs/config` with `ConfigService` injection.
8. **Guards** carry authentication and role authorization (`GqlAuthGuard`, `RoleGuard` + `@Roles(...)`); per-record ownership checks stay in an `*AssertService`, not the guard (rule P3).
9. Interceptors are for cross-cutting concerns (logging, caching) — never for business logic.
10. Request-scoped providers only with a stated reason: they disable Nest's singleton optimisation.
11. Tests: `Test.createTestingModule` against a real PGlite database via `DataCooker` (rule P5) — not a mocked repository; e2e through the real app with `supertest`, guards active.
12. Layout per feature: `<feature>.module.ts`, `<feature>.resolver.ts`, `<feature>.service.ts`, `dto/`, `entities/`, specs beside the code. Controllers are the exception, not the norm — this API is GraphQL-first; a REST `*.controller.ts` needs a reason.