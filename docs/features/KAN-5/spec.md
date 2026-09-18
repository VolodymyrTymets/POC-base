# KAN-5 — Init Web application

## Problem
This repo has no `web/` frontend yet — `docs/ARCHITECTURE.md` lists it as "planned ... does not exist",
and there is no monorepo tooling, no React/Vite app, and no way to consume the `api/` GraphQL schema from
a browser. A new POC forked from this base has to build all of that from scratch every time.

## Goal / business value
Serves ranked goal 1 in `docs/BUSINESS_MODEL.md` — project scaffolding: the base must stay easy to fork
and reuse. This ticket lays down the reusable `web/` scaffold (two apps + a shared package + GraphQL
codegen wired to the real API schema) the same way `api/` already exists as a reusable backend base.

## Scope
- in:
  - `web/` pnpm workspace: `packages/app`, `packages/admin`, `shared` (`components/`, `theme/`, `api/`)
  - Vite + React + TypeScript scaffold for both `app` and `admin`, each building and rendering a
    placeholder page
  - Tailwind CSS wired through a shared theme package both apps consume
  - `react-router` (declarative mode) with a couple of placeholder routes per app
  - `web/codegen.ts` generating typed GraphQL output from the real `api/schema.gql`
  - Oxlint configured for `web/` (matches the repo-wide tool choice, ADR-0007)
  - Docs: ADR for the new pattern, `CLAUDE.md` stack section, `ARCHITECTURE.md` update
- **out (explicit):**
  - Any real screen, business logic, or auth-flow UI — no pages beyond placeholders
  - Wiring the generated GraphQL types into an actual query/component (structural scaffold only,
    confirmed with the user — see Open questions)
  - Web test tooling (Vitest/React Testing Library) — deferred to a follow-up ticket, per the user
  - CI pipeline changes — `.github/workflows/**` is only touched in a dedicated PR with a human
    reviewer (rule T4)
  - Fixing the stale "Customer model" landmine entry in `ARCHITECTURE.md`/`RUNBOOK.md` — verified
    during this planning session that KAN-4 already fixed the underlying bug (the app boots and
    `tsc --noEmit` no longer reports the `Customers`/`prisma.customer` errors), but the docs weren't
    updated. Unrelated to this ticket; flagged in the PR body instead of fixed here (rule E2, C1).
  - Docker/staging/production wiring for `web/` — none exists for `api/` either yet

## Acceptance criteria
- [x] AC1 `web/pnpm-workspace.yaml` exists covering `packages/app`, `packages/admin`, `shared`, and
      `pnpm --dir web install` succeeds
- [x] AC2 `pnpm --dir web/packages/app run dev` serves a placeholder page (port 5173), styled with
      Tailwind, confirmed in a browser
- [x] AC3 `pnpm --dir web/packages/admin run dev` serves its own placeholder page on a different port
      (5174) concurrently with `app`, confirmed in a browser
- [x] AC4 Both apps' built CSS includes a utility/token defined once in `web/shared/theme`, proving the
      shared package is actually consumed, not just scaffolded empty
- [x] AC5 `pnpm --dir web run codegen` generates typed output under `web/shared/api/generated/` from
      `api/schema.gql`, with zero live-server/DB dependency
- [x] AC6 `pnpm --dir web/packages/app run build`, `...admin run build`, and
      `pnpm --dir web -r exec tsc --noEmit` all pass with zero errors
- [x] AC7 `pnpm --dir web run lint` (Oxlint) reports zero errors on the scaffolded code
- [x] AC8 `CLAUDE.md` carries a web stack section (and stays under 200 lines), `ARCHITECTURE.md`'s
      `web/` row is updated, and a new ADR records the stack decisions below

## Edge cases
| Case | Expected behaviour | Decided by |
|------|--------------------|-----------|
| `app` and `admin` dev servers run at the same time | Each binds a distinct fixed port (5173 / 5174) so they don't collide | this plan |
| `codegen` run without `api/schema.gql` present (api never built) | Fails with a clear "file not found" error, not a silent empty output (rule D5) | this plan |
| A future POC forks this repo and only wants one of the two apps | Each package is independently runnable/buildable; deleting one doesn't break the other or `shared` | goal 1 |

## Open questions
| # | Question | My assumed answer | Needs a human? |
|---|----------|-------------------|----------------|
| 1 | How much GraphQL wiring should this ticket prove? | Pure structural scaffold — no real query wired into a component | Asked the user directly — confirmed |
| 2 | Should this ticket add web test tooling? | No — deferred to a follow-up ticket | Asked the user directly — confirmed |
| 3 | Ticket names `graphql-codegen/typescript-react-apollo` as a dependency, but Context7 + a live npm check confirm its generated hooks are incompatible with Apollo Client 4.x (the current major, and what `pnpm add @apollo/client` installs today) | Use `@graphql-codegen/client-preset` instead (the currently recommended pairing with Apollo Client 4), output to `web/shared/api/generated/` instead of the ticket's literal `generated.graphql.tsx` filename | Yes — flagging at the plan approval gate |
| 4 | Live introspection (`http://localhost:3001/graphql`) vs. the committed `api/schema.gql` as codegen's schema source | Use `api/schema.gql` directly — decouples `web/` verification from `api/`'s docker/DB stack, which `docs/RUNBOOK.md` documents as having several pre-existing, unrelated setup issues | Flagging as a deviation, not blocking |
