# KAN-7 — implementation plan

<!-- A human writes this line to approve. Until it is here, guard-plan-approval blocks writes to code.
     A deliberate exception is written the same way, with its reason:
     Approved-by: spike, no review — KAN-7 -->
Approved-by: volodymyr · 2026-09-17

Pattern followed: `docs/features/KAN-8/plan.md` — the same shape of change (a dev-tooling swap, no
domain/contract impact) using the same ordered-requirements format. No ADR exists yet for lint tooling
specifically (confirmed by grepping `docs/decisions/`), but `docs/decisions/ADR-0006-pnpm-dependency-manager.md`
is the same *shape* of decision (swapping a core dev tool) and did get one — so this plan writes
`ADR-0007-oxlint-linter.md` (R6) rather than treating the absence of a lint-specific ADR as licence to skip
one (rule D1 — a new pattern needs an ADR; caught by the `/analyze` gate on the first pass of this plan).

## Contract changes
None — no GraphQL schema, Prisma schema, or REST surface changes. Dev-tooling only.

## Requirements (ordered, each independently verifiable)

### R1 — Generate the Oxlint config (S)
- files: `api/.oxlintrc.json` (new, via `npx @oxlint/migrate api/eslint.config.mjs`), `api/eslint.config.mjs`
  (read only in this step, removed in R3)
- layer: tooling config
- test: none directly — proven by R4's lint run actually executing
- executed how: run the migrate tool, then hand-review the generated JSON against the source config:
  confirm `no-explicit-any: off` (or its Oxlint rule-name equivalent) carried over; confirm type-aware
  rules (`recommendedTypeChecked`, `no-floating-promises`, `no-unsafe-argument`) were **not** carried over
  per OQ1 — if the migrate tool does add them, delete them by hand since `oxlint-tsgolint` is out of scope
- risk: the migrate tool may map a rule name Oxlint doesn't recognize (bad rule ID) — Oxlint fails loudly
  on an unknown rule in config, so this surfaces immediately during R4's run, not silently

### R2 — Add/remove devDependencies (S)
- files: `api/package.json` (`devDependencies`: add `oxlint`; remove `eslint`, `@eslint/js`,
  `@eslint/eslintrc`, `eslint-config-prettier`, `eslint-plugin-prettier`, `typescript-eslint`, `globals`)
- layer: tooling config
- test: none directly
- executed how: `pnpm --dir api add -D oxlint` then `pnpm --dir api remove eslint @eslint/js
  @eslint/eslintrc eslint-config-prettier eslint-plugin-prettier typescript-eslint globals` — pnpm owns
  `api/pnpm-lock.yaml` regeneration (rule T3), never hand-edited
- risk: `globals` might be a transitive dependency of something else and removing it from
  `devDependencies` could still leave it in the lockfile via another package — harmless either way, but
  confirm with `pnpm --dir api why globals` before removing if unsure

### R3 — Wire the lint script, delete the old config (S)
- files: `api/package.json` (`scripts.lint`: `eslint "{src,apps,libs,test}/**/*.ts" --fix` →
  `oxlint src test` — **check-only, no `--fix`**, plus a new `scripts.lint:fix`: `oxlint --fix src test`
  for deliberate, manually-reviewed fixing; dropping the two already-absent `apps`/`libs` segments;
  confirmed via Context7 (oxc.rs CLI docs) that Oxlint's CLI syntax is `oxlint [OPTIONS] [PATH]...` —
  positional directory/file paths, not a quoted glob string like ESLint's `"{src,test}/**/*.ts"`, so this
  is a real syntax change, not just cosmetic), `api/eslint.config.mjs` (deleted)
- layer: tooling config
- test: `pnpm --dir api run lint` runs to completion (exit code reflects real violations, not "command not
  found" or "no files matched")
- executed how: run the command, capture full stdout/stderr as evidence
- risk: **plan amendment, mid-implementation** — the plan originally kept `--fix` wired into `lint` for
  parity with the old ESLint script. During R1/R4 execution, `oxlint --fix` was found to silently strip a
  load-bearing `as unknown as AccountProfileEntity` cast in `src/account/account.resolver.ts`, breaking
  `tsc --noEmit` (`TS2740`) with zero diagnostic output — Oxlint's `--fix` only reports *unfixed* issues,
  so a fix that breaks the type checker leaves no trace of which rule did it. Confirmed by reverting the
  file and watching the `tsc` error disappear; could not isolate the exact rule (not reproducible in a
  minimal file). Human decision (mid-implementation checkpoint): drop `--fix` from the committed `lint`
  script entirely — matching Oxlint's own quickstart convention of separate `lint`/`lint:fix` scripts —
  so this class of silent, type-breaking rewrite cannot recur unattended on a future `pnpm run lint`/CI
  run. `lint:fix` still exists for a developer who wants it, reviewed by hand.

### R4 — Verify: lint runs clean of tooling errors (S)
- files: none (verification only)
- layer: n/a
- test: `pnpm --dir api run lint` — capture the real error/warning count (expected to differ from the
  ESLint-era 60/5 baseline; not a target to hit zero, see spec's out-of-scope)
- executed how: run the command against the current tree, paste the real output into the plan/PR evidence
- risk: a large, unrelated pre-existing violation count could read as "this PR made lint worse" if not
  captured clearly as a baseline change, not a regression — call this out explicitly in the PR body

### R5 — Verify: nothing else broke (S)
- files: none
- layer: n/a
- test: `pnpm --dir api exec tsc --noEmit` and `pnpm --dir api run build` — both are independent of
  ESLint/Oxlint, this just confirms removing the eslint devDependency tree didn't drag anything else out
  (e.g. via a shared transitive peer)
- executed how: run both, diff the error output against the pre-existing Customer-model baseline
  (`docs/RUNBOOK.md`) to confirm no new errors
- risk: none expected — `tsc`/`build` don't depend on ESLint
- note: precautionary, not tied to a specific acceptance criterion — included so a dependency-tree change
  doesn't silently regress an unrelated command

### R6 — Write the ADR (S)
- files: `docs/decisions/ADR-0007-oxlint-linter.md` (new)
- layer: docs
- test: none (docs)
- executed how: re-read the ADR after writing to confirm it names the decision (ESLint → Oxlint), the
  precedent it follows (ADR-0006, same shape of change — a core dev-tool swap), and records the
  deferred-type-aware-linting call (OQ1) as a consequence/follow-up, matching the pattern
  `docs/decisions/ADR-0006-pnpm-dependency-manager.md` sets for this kind of tooling decision (rule D1 —
  a new pattern needs an ADR, and analyze-plan confirmed this repo already treats a dev-tool swap of this
  shape as ADR-worthy)
- risk: none

### R7 — Other docs (S)
- files: `.claude/rules/js-tooling.md` (rule 4: reword the `eslint.config.mjs`-specific
  `no-explicit-any: off` reference to point at `.oxlintrc.json`; rule 7: same for the `sourceType:
  'commonjs'` reference — check whether Oxlint's config needs an equivalent `sourceType` setting at all,
  since its ignore/env model differs from ESLint's, and adjust the wording rather than assuming parity),
  `docs/RUNBOOK.md` (replace the ESLint "60 errors / 5 warnings" known-failure row with the real Oxlint
  count from R4, and add a note under "Known failures" or a new row for the `eslint-disable`-pattern CI
  guard gap described in the spec's out-of-scope, since it's a real, currently-undocumented gap a human
  should see)
- layer: docs
- test: none (docs)
- executed how: re-read both files after editing to confirm no stale `eslint.config.mjs`/`eslint`
  reference remains outside of historical/comparison context (e.g. "replaced ESLint" is fine, a live
  command reference is not)
- risk: none

## Docs to update in this PR
- [ ] `docs/features/KAN-7/spec.md` (acceptance criteria checked off)
- [ ] `docs/decisions/ADR-0007-oxlint-linter.md` (new, R6)
- [ ] `.claude/rules/js-tooling.md` (R7)
- [ ] `docs/RUNBOOK.md` (R7)

## Risks
| Risk | Impact | Cheapest way to find out early |
|------|--------|-------------------------------|
| `@oxlint/migrate` doesn't perfectly translate the flat config | A rule silently missing or renamed wrong | Hand-diff the generated `.oxlintrc.json` against `eslint.config.mjs` before running R4 (R1) |
| New Oxlint violation count reads as a regression to a reviewer | PR looks like it "broke lint" when it's a baseline change from a different rule set | State the real before/after counts explicitly in the PR body and `docs/RUNBOOK.md` (R4/R7) |
| `.github/workflows/agent-checks.yml`'s suppression guard only matches `eslint-disable`, not `oxlint-disable` | A future `oxlint-disable` suppression could land without a `WHY:` and the CI guard wouldn't catch it | Documented as a follow-up in `docs/RUNBOOK.md` (R7); not fixed here — CI files need a dedicated PR (rule T4) |
| `api/eslint.config.mjs`, `api/package.json`, `.claude/rules/js-tooling.md` are all "ask first" protected paths | Each edit needs a confirmation prompt during `/implement` | Expected friction, not a blocker |

## Assumptions
- "Replaced" (ticket AC) means ESLint's dependency, config, and script are fully removed — not the
  `eslint-plugin-oxlint` hybrid/gradual-migration approach, which exists for repos not ready to drop ESLint
  outright.
- Type-aware linting is out of scope for this ticket (human decision, plan approval round — see spec OQ1).
- Existing lint violations are not being fixed here, only re-baselined under the new tool (rule B4/C1,
  same boundary KAN-8 drew for its own out-of-scope items).
- Prettier and the `format` script are untouched — this ticket is about the `lint` script only.
