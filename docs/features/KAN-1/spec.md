# KAN-1 — Remove redundant technologies

## Problem
`api/` carries two things that slow down forking this base for a new POC (goal 1, `BUSINESS_MODEL.md`):
a second, unused caching layer (`@nestjs/cache-manager`'s `CacheModule`, registered in `app.module.ts`
but never injected anywhere — the real cache path is `PrismaCashingService`, which talks to Redis
directly via `ioredis`, ADR-0001/ADR-0003), and a pile of `eslint-disable` comments left over from the
ESLint era (ADR-0007 swapped ESLint for Oxlint) that no longer suppress anything real under the current
`.oxlintrc.json` ruleset. Both are dead weight a new fork would have to read past.

## Goal / business value
Goal 1 (`BUSINESS_MODEL.md`) — keep the base easy to fork and understand in under a day. Removing an
unused cache implementation and inert lint-suppression comments reduces what a new team has to
understand without changing behavior.

## Scope
- in:
  - Remove `@nestjs/cache-manager`'s `CacheModule` registration from `api/src/app.module.ts`.
  - Remove the now-unused runtime dependencies this drags in: `@nestjs/cache-manager`, `cache-manager`,
    `keyv`, `@keyv/redis`, `cacheable` (all four packages are used only by that registration — confirmed
    by grep, none are referenced by `PrismaCashingService` or elsewhere).
  - Remove every `eslint-disable(-next-line)` comment in `api/src` that suppresses an
    `@typescript-eslint/no-unsafe-*` rule (`no-unsafe-return`, `no-unsafe-call`, `no-unsafe-assignment`,
    `no-unsafe-member-access`) — these rules are not present in `.oxlintrc.json`'s active rule set, so
    the comments are already inert; deleting them is a no-op for lint output.
- **out (explicit):**
  - The remaining ~13 `eslint-disable` comments that suppress rules Oxlint *does* enforce
    (`typescript/ban-ts-comment`, `no-unused-vars`) — these guard 12 real `@ts-ignore`/`@ts-expect-error`
    directives, 8 of them in `PrismaCashingService.create()`'s dynamic Prisma-include logic (ADR-0003).
    Removing them requires actually retyping that code, which is a real type-safety refactor of core
    generic caching infrastructure, not a "delete an unused package" change (rule B4). Decision made
    with the user during planning: track as a follow-up ticket instead.
  - The `no-require-imports` error in `test/jest.setup.js` and the other pre-existing, unsuppressed
    Oxlint/`tsc` baseline violations documented in `docs/RUNBOOK.md`'s known-failures table — unrelated
    to this ticket.
  - `docs/RUNBOOK.md`'s "Customer model" landmine row: found stale while investigating this ticket (the
    `Customer`-model bug it describes no longer reproduces — `init.customer.migration.ts` now uses the
    real `AccountService`/`AccountProfileService`, and `tsc --noEmit` shows none of the `Customers`-related
    errors it documents). Flagged in the PR body per rule E2, not fixed here — outside this ticket's scope.

## Acceptance criteria
- [x] AC1 `@nestjs/cache-manager` and its `CacheModule` registration no longer appear anywhere in `api/`.
      Verified: `grep -rn "cache-manager\|CacheModule\|CACHE_MANAGER" api/src api/package.json` returns
      nothing.
- [x] AC2 `cache-manager`, `keyv`, `@keyv/redis`, `cacheable` are removed from `api/package.json` and
      `api/pnpm-lock.yaml` is regenerated (via `pnpm --dir api remove`, never hand-edited).
- [x] AC3 None of the ~20 dead `no-unsafe-*` `eslint-disable` comments remain in `api/src`. Verified: 19
      removed (grep count before/after), `pnpm --dir api run lint` output is byte-identical pre/post.
- [~] AC4 The real Redis cache (`PrismaCashingService`) is unaffected — verified via a real sign-in +
      authenticated `account` query (twice) against a running server: both calls returned correct,
      consistent data and no new errors. The literal "`[SQL Caching]` log line on hit" part of this AC
      could not be observed: the local Redis image (plain `redis`, not Redis Stack) rejects the RedisJSON
      commands `prisma-extension-redis`'s `type: 'JSON'` cache needs, so nothing is ever cached in this
      environment (`prisma-extension-redis: the Redis server rejects RedisJSON commands...` logged at
      boot, before any of my calls) — a pre-existing environment limitation unrelated to this change, not
      something this ticket introduced or can fix. `PrismaCashingService` itself functions correctly.
- [x] AC5 `pnpm --dir api exec tsc --noEmit` (65 pre-existing errors, unchanged, none touching the
      changed files), `pnpm --dir api run lint` (byte-identical output), `pnpm --dir api run build`
      (clean), and the unit suite (82 passed / 0 failed / 13 suites, both before and after the
      eslint-disable cleanup) show no new failures versus the pre-change baseline.

## Edge cases
| Case | Expected behaviour | Decided by |
|------|--------------------|-----------|
| A file's only `eslint-disable` comment is one of the dead `no-unsafe-*` ones | Delete the comment; if it was the last line of a multi-line disable block, don't leave a stray blank line | this plan |
| A disable comment suppresses a mix of dead and live rules on the same line (e.g. `no-unsafe-call,no-unsafe-member-access` alongside nothing live — checked, no such mixed line exists in this repo) | N/A — verified none of the 33 comments mix a dead and a live rule on the same directive | grepped during planning |

## Open questions
| # | Question | My assumed answer | Needs a human? |
|---|----------|-------------------|----------------|
| 1 | Remove only dead `eslint-disable` comments, or also the live ones guarding real `@ts-ignore`/`@ts-expect-error` in core caching code? | Dead only; live ones tracked as a follow-up ticket | Asked — user chose "dead comments only" |
