# ADR-0007 — Oxlint replaces ESLint as the linter

- **Date:** 2026-09-17
- **Status:** accepted
- **Deciders:** volodymyr (plan approval and mid-implementation checkpoints, KAN-7)
- **Ticket:** KAN-7

## Context
`api/` linted TypeScript with ESLint 9 (flat config, `eslint.config.mjs`):
`eslint.configs.recommended` + `typescript-eslint`'s `recommendedTypeChecked` (type-aware) +
`eslint-plugin-prettier`, run via `pnpm --dir api run lint`. KAN-7 asked to replace ESLint with Oxlint, a
Rust-based linter, for faster lint runs. This is the same *shape* of decision as ADR-0006 (swapping a
core dev tool) and follows its precedent of getting its own ADR rather than being buried in a PR
description.

## Decision
Oxlint (`oxlint`) replaces ESLint as `api/`'s linter. `api/.oxlintrc.json` was generated from the old
flat config via `@oxlint/migrate` and hand-reviewed. Three deliberate departures from a literal 1:1 port:

1. **Type-aware linting is dropped, not carried forward.** The old config's `recommendedTypeChecked` and
   the `no-floating-promises`/`no-unsafe-argument` overrides covered 23 rules that Oxlint only supports via
   a separate `oxlint-tsgolint` package (a Go binary, 59/61 rule parity with typescript-eslint, opt-in via
   `--type-aware`). Decided against adding it in this ticket — it's a real capability gap versus the old
   setup, not a hidden one; see Consequences.
2. **The Prettier integration is dropped, not bridged.** The migrated config wanted to keep
   `eslint-plugin-prettier` alive via Oxlint's `jsPlugins` mechanism (an alpha, non-semver-stable feature
   for running legacy ESLint plugins inside Oxlint). That would mean keeping an ESLint-ecosystem package
   installed specifically to preserve a redundant path, since `api/package.json`'s `format` script already
   runs Prettier standalone. Removed the `jsPlugins` entry and the `prettier/prettier` rule; formatting is
   Prettier's job alone now, matching the intent of "replace ESLint," not "wrap ESLint's plugins."
3. **`--fix` is not wired into the committed `lint` script.** Discovered during implementation:
   `oxlint --fix` silently stripped a load-bearing `as unknown as AccountProfileEntity` cast in
   `src/account/account.resolver.ts`, breaking `tsc --noEmit` (`TS2740`) with **zero diagnostic output** —
   Oxlint's `--fix` only reports issues it did *not* fix, so a fix that breaks the type checker leaves no
   trace of which rule did it. Confirmed by reverting the file and watching the `tsc` error disappear; the
   exact rule could not be isolated (not reproducible in a minimal repro file, only in the real one).
   `api/package.json`'s `lint` script is check-only (`oxlint src test`); a separate `lint:fix` script
   (`oxlint --fix src test`) exists for a developer to run and review by hand, matching Oxlint's own
   quickstart convention of separate `lint`/`lint:fix` scripts.

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| `eslint-plugin-oxlint` hybrid (keep ESLint, use Oxlint to disable overlapping rules) | Exists for repos not ready to drop ESLint outright — KAN-7's acceptance criteria say "replaced," not "supplemented." |
| Keep type-aware linting via `oxlint-tsgolint` | Adds a second binary dependency (Go) beyond what the ticket asked for; deferred as a human decision during plan approval (see spec OQ1), not silently dropped. |
| Keep `--fix` in the committed `lint` script for exact ESLint-era parity | The silent, untraceable `tsc`-breaking fix found on `account.resolver.ts` (Consequences) made this unsafe for an unattended/CI-run script; human decision at a mid-implementation checkpoint. |

## Consequences
- Positive: lint runs are dramatically faster (Rust vs. Node); the real baseline count dropped from 581
  errors / 39 warnings (the actual current ESLint baseline as installed today — the `docs/RUNBOOK.md`
  figure of 60/5 was stale, see that doc's updated entry) to 10 errors reported under Oxlint's
  non-type-aware rule set — expected, since ~23 type-aware rules are no longer enforced, not because the
  code got cleaner. **Correction (self-review):** that "10" is the count with existing `eslint-disable`
  comments still suppressing violations — Oxlint honors them (see below). The real unsuppressed count is
  **24** (11 `no-unused-vars`, 12 `ban-ts-comment`, 1 `no-require-imports`), verified by stripping every
  `eslint-disable*` line in `src`/`test` and re-running. All pre-existing, not introduced by this ticket.
- Accepted cost: type-aware checks (`no-floating-promises`, `no-unsafe-*`, etc.) are not enforced by lint
  anymore. `tsc --noEmit` (already in the command map) still catches outright type errors; it does not
  catch everything the old type-aware ESLint rules did (e.g. an unhandled floating promise that
  type-checks fine). Re-adding `oxlint-tsgolint` is a follow-up, not blocked by anything here.
- **Correction (self-review): Oxlint honors legacy `eslint-disable`/`eslint-disable-line`/
  `eslint-disable-next-line` comments as real suppressions — it does not ignore them.** Verified
  empirically: removing one from `src/common/pagination.service.ts` makes Oxlint newly flag the line it
  was suppressing. This was initially assumed backwards in this ADR and in `docs/features/KAN-7/spec.md`
  (both now corrected). Practical effect: `.github/workflows/agent-checks.yml`'s suppression-comment guard,
  which pattern-matches the literal string `eslint-disable`, **still functions** against every suppression
  written before this ticket. The real, narrower gap is that the guard does not *also* match Oxlint's own
  `oxlint-disable`/`oxlint-disable-line`/`oxlint-disable-next-line` syntax, which a suppression written
  after this ticket might use instead. Not fixed here — CI files are only changed in a dedicated PR with a
  human reviewer (rule T4). Flagged in `docs/RUNBOOK.md` as "extend the guard's pattern", not "the guard
  matches the wrong tool."
- Risk carried forward: Oxlint's `--fix` (via the new `lint:fix` script) is not type-aware and can produce
  a syntactically-valid but type-incorrect diff with no diagnostic explaining why, as seen on
  `account.resolver.ts`. Anyone running `lint:fix` should re-run `tsc --noEmit` before trusting the diff,
  the same discipline this ticket's implementation used to catch it.
- Accepted cost: no automated formatting check remains in the command map. Before this ticket,
  `eslint-plugin-prettier` surfaced Prettier drift as a `lint` error (so `pnpm --dir api run lint` would
  fail on unformatted code); dropping that bridge (Consequence/Decision point 2) means `pnpm --dir api run
  format` (`prettier --write`) is a writer, not a verifier, and nothing in the command map now fails on
  unformatted code. Not fixed here (would need a new `format:check` script — out of scope for a linter
  swap) — flagged for a human to decide whether it's an accepted gap or its own follow-up ticket.
- Minor, noted for future maintainers: `.oxlintrc.json` sets `"categories": { "correctness": "off" }` and
  re-enables ~57 individual rules by name, faithfully porting `eslint:recommended`'s fixed rule list. The
  tradeoff is that a correctness rule Oxlint adds in a future minor version won't turn on automatically —
  the config stops tracking the tool's own defaults. Accepted for a faithful migration; revisit if the repo
  later wants to just trust `"correctness": "error"` instead of an explicit list.
- Minor: `oxlint src test` lints `.js` files too (Oxlint doesn't restrict by extension the way the old glob
  `"{src,apps,libs,test}/**/*.ts"` did), which is where `test/jest.setup.js`'s `no-require-imports` error in
  the AC4 baseline comes from — a real, newly-surfaced pre-existing issue, not a bug in the migration.

## Revisit when
A future ticket wants type-aware lint parity back (add `oxlint-tsgolint`, `--type-aware`), the CI
suppression-guard gap above gets its own ticket and dedicated PR, or a formatting-check gap is judged worth
closing.
