# KAN-5 — implementation plan

<!-- A human writes this line to approve. Until it is here, guard-plan-approval blocks writes to code.
     A deliberate exception is written the same way, with its reason:
     Approved-by: spike, no review — KAN-5 -->
Approved-by: volodymyr · 2026-09-17

Pattern followed: none exists in this repo — `web/` is currently empty (confirmed via `ls`, and
`docs/ARCHITECTURE.md` lists it as "planned ... does not exist"). This is a new pattern; the closest
precedent is `api/`'s own self-containment (own `pnpm-workspace.yaml`, own lockfile, own command-map
entries) and ADR-0006/ADR-0007 (pnpm, Oxlint) as the repo-wide tool choices to carry forward. Recorded
as ADR-0008 in R7 below (rule D1).

## Contract changes
- boundary: none — this ticket only adds a GraphQL *consumer*; no resolver/schema change in `api/`
- data: none
- generated output: `web/shared/api/generated/**` (GraphQL Code Generator `client-preset` output, from
  `api/schema.gql` — regenerate with `pnpm --dir web run codegen`). New generated-output paths added to
  `.claude/rules/protected-paths.md` in R7.

## Requirements (ordered, each independently verifiable)

### R1 — Web workspace + shared package skeleton (S)
- files: `web/pnpm-workspace.yaml` (new), `web/package.json` (new, private root — `packageManager`
  pinned to the same pnpm version as `api/`, `engines.node` pinned to `22.16.0` to match
  `api/Dockerfile`), `web/.gitignore` (new), `web/tsconfig.base.json` (new — `strict: true`, per rule
  D3), `web/shared/package.json` (new, `@web/shared`), `web/shared/components/.gitkeep`,
  `web/shared/theme/.gitkeep`, `web/shared/api/.gitkeep` (new, placeholders)
- layer: workspace/tooling config — no app layer yet
- test: none (scaffold-only requirement)
- executed how: `pnpm --dir web install` run for real, lockfile + `node_modules` created, output
  captured
- risk: local Node is v24.16.0, not the pinned 22.16.0 (same pre-existing gap as `api/` — no v22
  install available). Per the standing precedent from the KAN-4 session, proceed on v24.16.0 and note
  the caveat rather than blocking (rule T2's intent, not a silent workaround: reported every time).

### R2 — `app` package scaffold (M)
- files: `web/packages/app/package.json`, `vite.config.ts` (`@tailwindcss/vite` plugin, `server.port:
  5173`), `tsconfig.json` (extends `../../tsconfig.base.json`), `index.html`, `src/main.tsx`
  (`ReactDOM.createRoot` + `<BrowserRouter>`), `src/App.tsx` (two placeholder `<Route>`s), `src/index.css`
  (`@import "tailwindcss";`), `.env.example` (new, `VITE_GRAPHQL_URL=http://localhost:3001/graphql`)
- layer: presentation (new deployable, mirrors `api/`'s status as a top-level deployable in
  `ARCHITECTURE.md`'s repo-layout table)
- test: none (deferred, per spec)
- executed how: `pnpm --dir web/packages/app run build` succeeds; `pnpm --dir web/packages/app run dev`
  started, page opened in a browser (Chrome tool), screenshot confirming Tailwind styling is applied —
  not just that the build exits 0
- risk: Tailwind v4's automatic content detection may need an explicit `@source` directive depending on
  final file layout — verify visually against the actual rendered page, not just a successful build

### R3 — `admin` package scaffold (S)
- files: `web/packages/admin/{package.json,vite.config.ts (server.port: 5174),tsconfig.json,index.html,
  src/main.tsx,src/App.tsx,src/index.css,.env.example}` — same shape as R2
- layer: presentation
- test: none (deferred, per spec)
- executed how: same as R2, plus running `app` and `admin` dev servers **at the same time** to confirm
  no port collision (AC3)

### R4 — Shared Tailwind theme (S)
- files: `web/shared/theme/tokens.css` (new — a Tailwind v4 `@theme` block defining one custom token,
  e.g. a brand color), `web/packages/app/src/index.css` (change: import the shared tokens before the
  Tailwind import), `web/packages/admin/src/index.css` (same change)
- layer: shared package consumption
- test: none
- executed how: build both apps, grep the built CSS in `dist/` for the shared token's generated value —
  proves `shared/theme` is consumed, not just present on disk (AC4)

### R5 — GraphQL codegen wiring (M)
- files: `web/codegen.ts` (new — `@graphql-codegen/cli` + `client-preset`, `schema` pointed at
  `../api/schema.gql` via a `GRAPHQL_SCHEMA_PATH` env var loaded with `dotenv`, output to
  `web/shared/api/generated/`), `web/.env.example` (new, `GRAPHQL_SCHEMA_PATH=../api/schema.gql`),
  `web/shared/api/ping/queries.ts` (new — one trivial `query Ping { __typename }`, just so codegen has
  a document to generate against; **not imported by any component**, per the scaffold-only scope),
  `web/package.json` (change: `codegen` script + `@graphql-codegen/cli`, `@graphql-codegen/client-preset`,
  `dotenv` devDependencies), `web/shared/package.json` (change: add `@apollo/client`, `graphql`
  dependencies so the generated output typechecks)
- layer: shared data-access package
- test: none (no consuming component, per spec's confirmed scope)
- executed how: run `pnpm --dir web run codegen` for real (needs only `api/schema.gql` on disk — build
  `api/` first if it isn't there yet — no live server or DB required, see deviation below); capture the
  real output; then `pnpm --dir web -r exec tsc --noEmit` to prove the generated types actually compile.
  Negative path also executed for real, not just asserted: temporarily rename `api/schema.gql`, run
  `pnpm --dir web run codegen` again, capture the actual failure output, then restore the file — proves
  the "fails loudly, not silently" edge case (spec.md) rather than assuming graphql-codegen's default
  behavior.
- risk / deviation: the ticket names `graphql-codegen/typescript-react-apollo`, but Context7 docs
  (`/dotansimha/graphql-code-generator`) confirm that plugin's generated hooks are incompatible with
  Apollo Client 4.x, which is what `pnpm add @apollo/client` installs today (confirmed via `npm view
  @apollo/client version` → `4.3.0`). Using `client-preset` instead, per current upstream guidance —
  flagged for the approval gate, not a silent substitution.

### R6 — Oxlint for `web/` (S)
- files: `web/.oxlintrc.json` (new, mirrors `api/.oxlintrc.json`'s conventions), `web/package.json`
  (change: `lint`/`lint:fix` scripts, `oxlint` devDependency at the same version `api/` uses)
- layer: tooling
- test: none
- executed how: `pnpm --dir web run lint` run for real, zero errors, output captured (AC7)

### R7 — Docs (S)
- files: `CLAUDE.md` (change: fix the now-stale opening line "This repo currently contains one
  deployable, `api/`" to reflect `web/` as a second deployable; append a "web" stack section +
  command-map rows, mirroring the existing backend section's style; confirm `wc -l CLAUDE.md` stays
  under 200 after the edit), `docs/ARCHITECTURE.md` (change: update the `web/` row in the repo-layout
  table — no longer "planned ... does not exist"), `docs/RUNBOOK.md` (change: add a "web first run"
  block — `pnpm --dir web install`, `pnpm --dir web run codegen`, `dev`/`build`/`lint` commands per
  package — plus the documented `schema.gql`-missing failure behavior verified in R5), `docs/decisions/
  ADR-0008-web-app-scaffold.md` (new — records the pnpm-workspace layout, Tailwind v4 +
  `@tailwindcss/vite`, `react-router` declarative mode (not framework mode — matches the ticket's "react
  vite" base), and the Apollo Client 4 / `client-preset` deviation from R5 with its rationale),
  `.claude/rules/protected-paths.md` (change: add `web/**/generated/**`, `web/**/node_modules/**`,
  `web/**/dist/**`, `web/pnpm-lock.yaml` to the existing categories)
- executed how: docs read back after edit; `wc -l CLAUDE.md` checked for real

## Docs to update in this PR
- [ ] docs/features/KAN-5/spec.md (acceptance criteria checked off)
- [ ] docs/ARCHITECTURE.md — `web/` row, repo layout table
- [ ] docs/RUNBOOK.md — web first-run steps + schema.gql-missing failure mode
- [ ] docs/decisions/ADR-0008-web-app-scaffold.md — new pattern, per rule D1
- [ ] CLAUDE.md — stale "one deployable" line fixed; web stack section (command map) added
- [ ] .claude/rules/protected-paths.md — new generated-output paths

## Risks
| Risk | Impact | Cheapest way to find out early |
|------|--------|-------------------------------|
| Scope is large for one PR — 7 requirements across a whole new deployable (crosses an architectural boundary, rule F2) | Could run past "one day," the F2 threshold for escalation | Flagging explicitly at the approval gate rather than splitting silently; human can ask for a split into multiple tickets instead |
| Apollo Client 4 / `client-preset` deviates from the ticket's literal dependency list | A reviewer expecting `typescript-react-apollo` output shape could be surprised | Documented in spec's Open Questions #3 and ADR-0008; raised at approval, not silently swapped |
| Tailwind v4's CSS-first config is a recent major-version change (no `tailwind.config.js` by default) | Setup steps look different from most existing tutorials/training data | Verified current install steps live via Context7 (`/tailwindlabs/tailwindcss.com`) before writing this plan, not from memory |
| `api/schema.gql` must exist on disk before `codegen` can run | `pnpm --dir web run codegen` fails on a completely fresh clone that hasn't built `api/` yet | Documented as a prerequisite in the RUNBOOK update accompanying this PR's evidence, and codegen fails loudly (rule D5) rather than silently |

## Assumptions
- `web/` gets its own self-contained pnpm workspace (own `pnpm-workspace.yaml`, own lockfile), matching
  `api/`'s existing self-containment, rather than a single root-level workspace spanning both.
- Node 22.16.0 is the pin for `web/` too (matches `api/Dockerfile`); verification proceeds on the
  actually-available v24.16.0 with the mismatch noted, per the standing precedent from the KAN-4 session.
- `react-router` is used in **declarative mode** (`BrowserRouter`/`Routes`/`Route`), not framework mode —
  matches the ticket's explicit "react vite" base and its dependency list (`react-router` only, no
  `@react-router/dev`).
- The stale "Customer model" landmine entries in `ARCHITECTURE.md`/`RUNBOOK.md` (already fixed by KAN-4,
  confirmed this session via `tsc --noEmit`) are flagged in the PR body, not fixed in this PR — unrelated
  to `web/` scaffolding (rule C1).
