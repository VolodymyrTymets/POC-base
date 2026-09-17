# POC Base — project constitution

Managed by the `apiko-agent` plugin. Hard rules only; depth lives in the pointers at the bottom.
Placeholders are filled by `/setup`. Keep this file under 200 lines — if a rule needs depth, move it
to `.claude/rules/`, `docs/`, or a skill and leave a pointer.

This repo currently contains two deployables: `api/` (NestJS + GraphQL) and `web/` (Vite + React,
scaffolded by KAN-5 — `app` and `admin` apps sharing `web/shared`; see the web stack section below).

## Command map (the only commands you should run)

| Task | Command |
|------|---------|
| install | `pnpm --dir api install` |
| typecheck | `pnpm --dir api exec tsc --noEmit` |
| lint | `pnpm --dir api run lint` (Oxlint, check-only — ADR-0007) |
| lint (fix) | `pnpm --dir api run lint:fix` — not type-aware; always re-run typecheck afterwards, it can silently strip a load-bearing cast (ADR-0007) |
| unit tests | `NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config ./test/jest.json` |
| affected tests | none — single package, no affected-test tooling |
| build | `pnpm --dir api run build` |
| dev server | `pnpm --dir api run start:dev` (API) · `pnpm --dir api run worker:start:dev` (worker) |
| e2e | `NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config ./test/jest-e2e.json` |
| db migrate (local only) | `pnpm --dir api run prisma-migrate` |

Dependency manager: **pnpm**. Runtime pinned by **`api/Dockerfile`**: **node 22.16.0**.

- **T1** Run tasks through the commands above. Never invent a script name, never `cd` and guess.
- **T2** If your local runtime version differs from the pinned one, stop and report — do not work around it.
- **T3** Use the dependency manager this repo declares, and only that one. Never hand-edit or delete a lockfile.
- **T4** CI and pipeline files are changed only in a dedicated PR with a human reviewer.

## A. Git and PR

- **A1** Never commit or push to `main`. Branch as `feat|fix|chore/<TICKET>-<slug>`.
- **A2** Never `git push --force` to a shared branch; `--force-with-lease` on your own branch only.
- **A3** Never rewrite history that is already pushed and reviewed.
- **A4** One PR = one requirement. Open it as a **draft**. A human marks it ready. You never mark ready, never approve, never merge.
- **A5** Conventional Commits, imperative mood, Jira ticket ID in the subject (e.g. `KAN-123`). No "AI generated" notes, no emoji.
- **A6** Never commit secrets, `.env*`, tokens, keystores, provisioning profiles or client data.
- **A7** The PR body uses the template: what changed, why, how it was verified (commands + output), what is NOT covered.

## B. Definition of done — verification is mandatory

- **B1** A task is done only when, for the affected workspace: typecheck passes, lint passes, affected tests pass, **and the change was executed** — a real GraphQL operation against a running server, or the equivalent for a worker/migration change.
- **B2** Report the exact commands and their real output. Never claim a result you did not observe. List anything unverified under "Not verified".
- **B3** Never make a check pass by weakening it — no silencing the type checker or linter, no skipping or narrowing tests, no bypassing pre-commit hooks, no deleted assertions, no blind snapshot re-record, no removed CI steps — unless a human approved it in the PR and the line carries `WHY: <reason + ticket>`.
- **B4** If the correct fix is bigger than the ticket, stop and report. Do not paper over it.
- **B5** Attach evidence: request/response for API changes, the failing-then-passing test for a bug fix.

## C. Scope

- **C1** Change only what the requirement needs. No opportunistic refactors, renames, formatting sweeps or version bumps in a feature PR — propose them separately.
- **C2** Never add a runtime dependency without explicit approval. Prefer what the repo already has.
- **C3** Never edit generated, vendored or native build artefacts — see `.claude/rules/protected-paths.md`.
- **C4** Never run a destructive or irreversible command (DB drop/reset, `rm -rf`, force push, deploy) without explicit human confirmation in the same message.
- **C5** Never touch production. Local and staging only, no prod DSNs or credentials.

## D. Code and context

- **D1** Read before you write: find the existing pattern for what you are building and follow it. A new pattern needs an ADR in `docs/decisions/`.
- **D2** This repo's conventions outrank generic best practice. When they conflict, follow the repo and raise the conflict (see ADR-0003 on the GraphQLResolveInfo exception to transport isolation).
- **D3** No escape hatch out of the type system in new code — no untyped catch-alls, no unchecked casts, no non-null assertions without a `WHY:` comment.
- **D4** Never invent an API. Verify library APIs with Context7 or the installed source; verify business rules in `docs/` or by asking.
- **D5** Errors are never swallowed. No empty `catch`, no silent `return null`.
- **D6** Comments explain *why*. No commented-out code. No `TODO` without a ticket ID.
- **D7** No hardcoded user-facing strings — i18n keys only. (No i18n layer exists yet in this API; this applies once one is added.)
- **D8** No secrets, tokens, PII or full request bodies in logs — this repo stores SSN, DOB and phone number on `AccountProfile`, so this is not hypothetical.

## E. Documentation

- **E1** Docs update in the same PR as the code: the feature spec, `docs/ARCHITECTURE.md` on structural change, `docs/DOMAIN_GLOSSARY.md` on new domain terms, an ADR for a settled decision.
- **E2** A stale doc found while working is a bug: fix it in the same PR or file it in the PR body.

## F. Collaboration

- **F1** When planning, ask only genuine gaps you cannot resolve from code or docs — max two rounds — then proceed and state your assumptions.
- **F2** Escalate to a human when: acceptance criteria conflict with this constitution; a security or auth decision is involved; client data or credentials are involved; the work crosses an architectural boundary or looks like more than a day.
- **F3** State uncertainty plainly. "I am not sure" beats a confident guess.

## G. Client confidentiality (never relaxed)

- **G1** Client code, data and credentials never leave the tools listed in `docs/AGENT_TOOLING.md`.
- **G2** Nothing client-specific is copied into the shared Apiko config or another client's repo. Only generic engineering conventions may be promoted, by a human, through a PR to the shared plugin.
- **G3** Reference files by path instead of pasting client data into a prompt.

## Where things live

- Stack rules: `.claude/rules/` — auto-loaded when you touch a matching path
- Architecture: @docs/ARCHITECTURE.md
- Product goals & priorities (tie-breaker for judgement calls): @docs/BUSINESS_MODEL.md
- Domain terms: @docs/DOMAIN_GLOSSARY.md
- Settled decisions: `docs/decisions/`
- Agent tooling & MCP policy: @docs/AGENT_TOOLING.md
- How to run things: @docs/RUNBOOK.md
- Workflow: `/plan` → `/analyze` → `/implement` → `/review-pr`. The draft PR is the last stage of `/implement`, not a separate command.

**Stack:** backend **NestJS** · API **GraphQL** (code-first, `schema.gql` generated) · web **Vite + React** (see below) · mobile **none** · ORM **Prisma**

| Task | Command |
|------|---------|
| codegen (Prisma client + GraphQL schema) | `pnpm --dir api run prisma-gen` (schema.gql regenerates automatically at boot) |
| format the changed files | `pnpm --dir api run format` |

- **S1** `.claude/rules/backend-core.md` applies to all backend code. `backend-nestjs.md` and `api-graphql.md` **add** to it and never override it. If they appear to conflict, core wins and you raise it.
- **S2** Business logic never sees the transport — **except** the confirmed repo convention of passing `GraphQLResolveInfo` from resolver into service methods for field-selection and caching (`getPrismaIncludeFromGqInfo`, `PrismaCashingService`). See ADR-0003. Do not extend this exception to `context`, `req` or `res`.
- **S3** The GraphQL schema (`schema.gql`) is generated from the `@Resolver`/`@ObjectType` decorators — never hand-edit it; fix the decorators and let Nest regenerate it on boot.
- **S4** Prisma schema, generated client, and every resolver/service consumer change in the **same PR**. A workspace-wide typecheck is what proves it.

**Stack (web):** two Vite + React + TypeScript apps (`app`, `admin`) sharing `web/shared`
(components, theme, GraphQL data-access) · routing **react-router** (declarative mode) · styling
**Tailwind CSS v4** · GraphQL client **Apollo Client 4** · codegen **`@graphql-codegen/client-preset`**
— see ADR-0008.

| Task | Command |
|------|---------|
| install | `pnpm --dir web install` |
| typecheck | `pnpm --dir web -r exec tsc --noEmit` |
| lint | `pnpm --dir web run lint` (Oxlint) |
| lint (fix) | `pnpm --dir web run lint:fix` |
| dev server | `pnpm --dir web/packages/app run dev` (app, :5173) · `pnpm --dir web/packages/admin run dev` (admin, :5174) |
| build | `pnpm --dir web/packages/app run build` · `pnpm --dir web/packages/admin run build` |
| codegen | `pnpm --dir web run codegen` (reads `api/schema.gql` — build `api/` first if it's missing) |

- **W1** `web/` is its own self-contained pnpm workspace, separate from `api/`'s — own `pnpm-workspace.yaml`, own lockfile. Don't mix commands across them.
- **W2** No test tooling exists yet for `web/` (deferred as a KAN-5 follow-up) — verification is typecheck + build + a real browser check until it lands.
- **W3** `web/shared/api/generated/**` is generated by `codegen` from `api/schema.gql` — never hand-edit it; re-run codegen instead.

<!-- PROJECT-SPECIFIC RULES: add below this line, keep each one short and say why. -->

- **P1** Prisma relation fields are PascalCase matching the related model name (`AccountProfile`, `LastAccountRole`); scalar fields are camelCase. Follow this in every new model.
- **P2** Soft deletes only: every model carries `deleted: Boolean @default(false)`. Never write a hard `delete()` against a domain table.
- **P3** Authorization is layered: `GqlAuthGuard` authenticates; `RoleGuard` + `@Roles(...)` authorizes by role via `AccountRoleService`; a separate `*AssertService` (e.g. `FileAssertService`) re-checks per-record ownership inside the service before a mutation. All three layers are required for a guarded mutation, not just the guard.
- **P4** Seed/reference data (roles, admin accounts, dev fixtures) lives in `src/migrations/items/` (all environments) and `src/migrations/items.development/` (dev-only), as an `IMigrationItem` (`inNeedToRun()`/`run()`), auto-run by `docker-prisma-migration.sh` before boot. This is separate from Prisma's own schema migrations in `prisma/migrations/`.
- **P5** Tests use `DataCooker` against PGlite (in-memory Postgres with PostGIS) for a real database, never mocks — see `.claude/skills/test-conventions/SKILL.md`. This replaces the generic docker/testcontainers pattern in `testing-js.md` rule 4 for this repo.