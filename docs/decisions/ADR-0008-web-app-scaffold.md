# ADR-0008 — web/ app scaffold: pnpm workspace, Tailwind v4, Apollo Client 4 + client-preset

- **Date:** 2026-09-17
- **Status:** accepted
- **Deciders:** volodymyr (plan approval), agent (library research)
- **Ticket:** KAN-5

## Context
`web/` did not exist before this ticket (`docs/ARCHITECTURE.md` listed it as "planned ... does not
exist"). KAN-5 asks for a base React + Vite frontend: two apps (`app`, `admin`) sharing a `shared`
package, with Tailwind, `react-router`, and GraphQL codegen. There was no precedent in this repo to
follow, so every structural choice below is new and needed a decision, not just an implementation.

## Decisions

**1. `web/` is its own self-contained pnpm workspace**, separate from `api/`'s (own
`pnpm-workspace.yaml`, own lockfile), covering `packages/*` and `shared`. Mirrors `api/`'s existing
self-containment rather than introducing a single root-level workspace spanning both deployables.

**2. Tailwind CSS v4**, via the first-party `@tailwindcss/vite` plugin and a plain `@import
'tailwindcss'` — no `tailwind.config.js`. Verified live via Context7
(`/tailwindlabs/tailwindcss.com`) rather than assumed, since v4's CSS-first config is a recent major
change from the older `postcss.config.js` + `tailwind.config.js` pattern most training data reflects.

**3. `react-router` in declarative mode** (`BrowserRouter`/`Routes`/`Route`), not framework mode.
Framework mode replaces Vite's own dev server/build pipeline with `@react-router/dev`; the ticket's
"react vite" base and its dependency list (`react-router` only, no `@react-router/dev`) both point at
keeping Vite as the build tool and using `react-router` as a plain client-side routing library.

**4. Apollo Client 4.x + `@graphql-codegen/client-preset`, not the ticket's literal
`graphql-codegen/typescript-react-apollo`.** The ticket named `typescript-react-apollo`, but Context7
docs for `/dotansimha/graphql-code-generator` state that plugin's generated hooks are not compatible
with Apollo Client 4.0+. `npm view @apollo/client version` confirmed `4.3.0` is what installs today —
there is no way to satisfy the ticket's literal dependency list and get working generated code at the
same time. `client-preset` is upstream's current recommended pairing with Apollo Client 4, so that's
what this scaffold uses. Output shape differs from the ticket's stated single `generated.graphql.tsx`
file — `client-preset` generates a directory (`web/shared/api/generated/{graphql,gql,fragment-masking,index}.ts`)
instead.

**5. Codegen reads `api/schema.gql` directly, not live introspection.** The alternative (pointing
`codegen.ts`'s `schema` field at `http://localhost:3001/graphql`) would make `web/`'s own verification
depend on `api/`'s full docker/DB stack being up, which `docs/RUNBOOK.md` documents as having several
pre-existing, unrelated setup issues (env file paths, DB name mismatch, compose build context). Reading
the committed schema file decouples the two; `web/codegen.ts` reads the path from a
`GRAPHQL_SCHEMA_PATH` env var (via `dotenv`, as the ticket's dependency list already asked for) so a
future POC can repoint it at a live URL if it wants to.

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| `typescript-react-apollo` codegen plugin (as literally named in the ticket) | Confirmed incompatible with Apollo Client 4.x — would generate hooks that don't compile against the client actually installed |
| Apollo Client 3.x, to keep `typescript-react-apollo` compatible | Installing an older major on a brand-new scaffold, just to keep a codegen plugin the upstream project itself is deprecating, trades a real reusability cost for matching the ticket's literal text |
| `react-router` framework mode | Would replace Vite's build pipeline; conflicts with the ticket's explicit "react vite" base |
| Live GraphQL introspection for codegen | Couples every `web/` codegen run to `api/`'s docker/DB stack, which has several pre-existing unrelated issues (see RUNBOOK) |
| Single root-level pnpm workspace spanning `api/` and `web/` | `api/` is already self-contained; unifying now would touch `api/`'s tooling for a `web/`-only ticket (scope creep, rule C1) |

## Consequences
- Positive: codegen and typecheck are fully reproducible from a fresh clone with only `api/` built once
  (no live server, no DB, no Docker needed for `web/` verification).
- Accepted cost: a developer following the ticket's implementation-details section literally will find
  the actual dependency (`client-preset`) and output path differ from what's written there — this ADR
  and `docs/features/KAN-5/spec.md`'s Open Questions are the record of why.
- Follow-ups (not done here, flagged for the team): web test tooling (Vitest/RTL) is deferred to a
  follow-up ticket; no CI wiring exists for `web/` yet (rule T4 — separate PR).

## Revisit when
Apollo Client's ecosystem adds a `typescript-react-apollo`-equivalent that supports v4+, or the team
decides to standardize on a different GraphQL client entirely.
