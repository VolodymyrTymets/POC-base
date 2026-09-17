---
description: JS/TS ecosystem tooling rules - dependency manager, TypeScript strictness, dependency additions, generated artefacts.
paths:
  - "api/package.json"
  - "api/pnpm-workspace.yaml"
  - "api/tsconfig*.json"
  - "api/.npmrc"
---

# JS/TS tooling rules

Core rules T1–T4 already cover the command map, the pinned runtime, the single dependency manager and pipeline files. These add what is specific to this ecosystem.

1. The dependency manager is **pnpm** (declared by `api/pnpm-workspace.yaml`; `api/package.json` does not yet declare a `packageManager` field — treat pnpm as authoritative per the human decision recorded in ADR-0006, and prefer adding the field over relying on this note). Never mix managers, never delete or hand-edit `api/pnpm-lock.yaml`, never `--force` past a conflict — resolve the real version conflict or ask. `api/yarn.lock` is stale (see RUNBOOK known failures) — do not run `yarn` commands.
2. `api/` is a single pnpm project, not a multi-package workspace — run tasks from the repo root with `pnpm --dir api <script>`, never by `cd api && ...` and guessing a script name that isn't in `api/package.json#scripts`.
3. Never add a dependency to `api/package.json` for a single feature's needs without checking it's actually missing — this repo currently has undeclared runtime deps (`lodash`, `ms`, `keyv`, `@prisma/driver-adapter-utils`) that only worked by accident under yarn's hoisting; see RUNBOOK. Adding a genuinely new dependency still needs one dependency change per PR, size/licence/maintenance justified (rule C2).
4. **No `any` in new code** — `unknown` plus narrowing. `api/.oxlintrc.json` (Oxlint, ADR-0007) leaves
   `no-explicit-any` unconfigured/off repo-wide; that is a leniency for existing code, not permission for
   new code. No non-null `!` and no `as` cast without a `// WHY:`. No `@ts-ignore`/`@ts-expect-error`
   without a human-approved `// WHY:` (rule B3). Note: Oxlint's lint rules are not type-aware (ADR-0007) —
   `tsc --noEmit` is what actually catches an unchecked cast or a floating promise now, not `lint`.
5. `tsconfig.json` `strict`/`strictNullChecks` flags change only with an ADR — they affect every package.
6. Generated output (`api/generated/prisma/**`, `api/schema.gql`) is never hand-edited; fix the source (`prisma/models/*.prisma` or the resolver decorators) and re-run `pnpm --dir api run prisma-gen` / let Nest regenerate the schema (rule C3).
7. `node:` prefix for Node built-ins. This package uses CommonJS — the old `eslint.config.mjs` declared this
   explicitly via `sourceType: 'commonjs'`; Oxlint (ADR-0007) has no equivalent global setting and detects
   module type per file instead, so there is nothing to configure, but the rule stands: do not introduce
   ESM syntax that assumes a different module system without an ADR.
8. Peer/transitive dependencies must be declared in `api/package.json`, not assumed from hoisting — pnpm's strict `node_modules` linking does not expose a package unless it is declared, which is exactly the current `lodash`/`ms`/`keyv` breakage (RUNBOOK).
9. Formatting is mechanical: `pnpm --dir api run format` and the formatter hook own it. Never argue about it in review, never reformat files a PR does not otherwise touch (rule C1).