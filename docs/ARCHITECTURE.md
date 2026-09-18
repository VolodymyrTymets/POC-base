# Architecture

> What the system **is** and where code belongs. Structure truths only — no style preferences (those live in `.claude/rules/`).
> Update in the same PR as any structural change (rule E1).

## Repo layout
| Path | What lives here | Deployable? | Owner |
|------|-----------------|-------------|-------|
| `api/` | NestJS + GraphQL + Prisma backend | yes — two entrypoints, `api` and `worker` | backend |
| `api/src/<feature>/` | one module per domain area: `account`, `account-profile`, `account-role`, `auth`, `files`, `background-workers`, `notifier`, `migrations`, `common`, `prisma`, `decorators` | — | backend |
| `api/prisma/` | Prisma schema (split across `models/*.prisma`) and migrations | — | backend |
| `api/generated/prisma/` | generated Prisma Client — never hand-edit | — | generated |
| `api/schema.gql` | generated GraphQL SDL (code-first, from resolver decorators) — never hand-edit | — | generated |
| `api/test/` | e2e specs, `DataCooker`, GraphQL test client, service mocks | — | backend |
| `web/` | Vite + React + TypeScript frontend, scaffolded by KAN-5 (ADR-0008) — own pnpm workspace, separate from `api/`'s | yes — two entrypoints, `app` and `admin` | frontend |
| `web/packages/app/`, `web/packages/admin/` | the two apps — placeholder routes only so far, no real screens yet | — | frontend |
| `web/shared/` | shared `components/`, `theme/` (Tailwind v4 tokens) and `api/` (GraphQL documents + `client-preset` output) consumed by both apps | — | frontend |
| `web/shared/api/generated/` | generated GraphQL types (`@graphql-codegen/client-preset`, from `api/schema.gql`) — never hand-edit | — | generated |
| `web/Dockerfile` | dev-server-only image for `web/`, two targets (`app-dev`, `admin-dev`) — no production/nginx stage (KAN-2, ADR-0009) | — | frontend |
| `docker-compose.yml` | local dev stack: `api`, `worker`, Postgres+PostGIS, Redis, and (since KAN-2, ADR-0009) `web-app`/`web-admin`; every service's host port is configurable via `set-ports.sh` for running more than one stack at once | — | backend |

## Where data truth lives
- **PostgreSQL (PostGIS enabled)** is the single source of truth for domain data, accessed exclusively through Prisma (`api/src/prisma/prisma.service.ts`).
- **Redis** is a derived cache only (via `prisma-extension-redis` / `@keyv/redis`, wired in `PrismaCashingService`) — never authoritative, safe to flush (with the caveat that it is also the BullMQ queue backend, so flushing it also drops in-flight background jobs).
- **BullMQ queues (Redis-backed)** hold transient background-job state (e.g. `sms-sender`), not domain data.
- Prisma seed/reference data (roles, dev fixtures) is tracked separately from schema migrations via the `IMigrationItem` mechanism in `api/src/migrations/` (rule P4) — this is itself a source of truth for role definitions, run before the app accepts traffic.

## Boundaries and contracts
| Boundary | Format | Source of truth | Generated output (never hand-edited) | Regeneration command |
|----------|--------|-----------------|--------------------------------------|----------------------|
| GraphQL API | GraphQL over HTTP (Apollo, `/graphql`) | `@Resolver`/`@ObjectType`/`@InputType` decorators in `api/src/**` | `api/schema.gql` | automatic on `pnpm --dir api run start:dev` boot |
| Database schema | Prisma schema | `api/prisma/models/*.prisma` | `api/generated/prisma/**`, `api/prisma/migrations/**` | `pnpm --dir api run prisma-gen` (client), `pnpm --dir api run prisma-migrate` (migration, local DB only) |
| File storage | `File.content` (Postgres `bytea`), served as a `data:` URI (ADR-0010) | `api/src/files/` (`FilesService`) | — | — |
| `web/`'s GraphQL types | TypeScript, from `api/schema.gql` | `api/schema.gql` (not live introspection — see ADR-0008) | `web/shared/api/generated/**` | `pnpm --dir web run codegen` |

There is no REST contract of note: `AppController` exposes a single `/test` placeholder route, not a real API surface.

## Environments
| Env | URL | Database | Who may touch it |
|-----|-----|----------|------------------|
| local | `http://localhost:3001/graphql` | local Postgres via `docker-compose.yml` (`.env.development`) | anyone |
| test | in-process | PGlite in-memory, via `DataCooker` (`.env.test`) | anyone, automatically |
| staging | *(not yet defined in this repo — no CI/deploy pipeline exists)* | | team |
| production | *(not yet defined in this repo)* | | **not the agent** (rule C5) |

## Key flows

### 1. Sign in (OTP)
Client requests an OTP mutation (`auth.resolver.ts` → `AuthService` → `OtpAuthStrategyService`) → `OtpCodeGeneratorService` generates and hashes a code, `NotifierService`/`SmsNotifierService` delivers it (queued via `sms-sender` BullMQ worker) → client submits the code → `JwtAuthStrategyService`/`JwtStrategyService` issues access + refresh JWTs (`AuthTokensEntity`) → `RoleGuard` + `AccountRoleService` gate subsequent requests by role.

### 2. Authenticated GraphQL read
Resolver (`@UseGuards(GqlAuthGuard)`) → service extending `PrismaCashingService`, passing `GraphQLResolveInfo` down (`getPrismaService(infoToPrismaCashingConfig(info))`, `getPrismaIncludeFromGqInfo(info)`) → Prisma selects only the requested fields, response cached in Redis for subsequent identical selections.

### 3. File upload
Client calls `createFile` mutation with an optional base64 `content` → `FileAssertService` validates the
input (decoded content's byte length against `FILE_MAX_SIZE`; `mimeType` is required whenever `content`
is present, falling back to the record's stored `mimeType` on an update that omits it) → `FilesService`
stores the decoded bytes directly in the `File.content` column (Postgres, ADR-0010) — a follow-up
`updateFile` mutation (re-checked by `FileAssertService.assertUpdateFile`) can attach `content` when a
client creates the record first. There is no separate upload-status field (`FileStatus` was removed,
ADR-0010's amendment) — presence of `content` is the state. `FileEntity.publicUrl` is computed from the
stored bytes as a `data:<mimeType>;base64,<content>` URI (selected from Prisma only when the query's
selection set actually requests it, including through fragments) — there is no external storage call in
this flow.

## External integrations
| Service | Purpose | Failure mode | Sandbox available? |
|---------|---------|--------------|--------------------|
| SMS provider (via `SmsNotifierService`) | OTP delivery | sign-in blocked | mocked in tests (`test/utils/mock-services`); no real sandbox wired yet |
| Sentry | error tracking (`@sentry/nestjs`) | silent — errors just aren't reported | disabled locally (`enabled: NODE_ENV !== 'local'` in `api/src/instrument.ts`) |

## Known constraints and landmines
- `account.service.ts` writes to a `Customers` relation and `src/migrations/items.development/init.customer.migration.ts` reads `this.prisma.customer` — **no `Customer` model exists in the Prisma schema.** Confirmed broken (`tsc --noEmit`, `pnpm run build`) — and bigger than previously documented here: `MigrationsModule.onModuleInit()` runs `InitCustomerMigration` whenever `NODE_ENV` is `local`/`test`/`development`, so **the app fails to boot at all** under `pnpm --dir api run start:dev` with the committed `.env` (confirmed KAN-8, 2026-09-17), and the same crash takes down `DataCooker.beforeAll()` for every suite that uses it — 5 of 10 unit test suites and all 4 e2e suites fail, not just `sign-in-otp.e2e-spec.ts`. See `docs/RUNBOOK.md`'s known-failures table. Needs a real fix, not covered by KAN-8 (rule B4 — bigger than a package-manager swap) — tracked as KAN-4.
- ~~`docker-compose.yml`'s `env_file: .env.development` resolves relative to the repo root...~~ **Fixed as
  of KAN-2 (2026-09-18)** — along with the `api`/`worker` build-context landmine and the Postgres
  healthcheck db-name mismatch that used to be documented alongside this one. See `docs/RUNBOOK.md`'s
  "Fixed by KAN-2" note and `docs/decisions/ADR-0009-configurable-ports.md`.
- No CI pipeline exists yet (no `.github/workflows/**` before this PR) and no staging/production environment is defined in this repo.
- `src/background-workers/sms-sender/sms-sender.module.ts` uses `console.log`/`console.debug` and the `sms-sender` BullMQ queue has no visible retry/backoff or dead-letter configuration — both are violations of `.claude/rules/backend-core.md` rules 19/20 to fix in new work on that module, not silently carried forward.
