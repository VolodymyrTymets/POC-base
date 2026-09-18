# Business model

> Why this product exists. This file is the **tie-breaker** the agent uses when two technically valid options collide.
> Goals must be **ranked** — an unranked list gives no way to decide.

## What this product is
`poc-base` is an internal starter kit for spinning up future client POC projects quickly. It is not itself
a customer-facing product: `api/` is the reusable backend base (NestJS + GraphQL + Prisma), providing a
basic authorization pipeline, file uploading, data mocking/seeding, a migration mechanism, and a test
base — the pieces a new POC would otherwise have to rebuild from scratch.

## Ranked goals
1. **Project scaffolding** — the base itself must stay easy to fork/reuse as the starting point for a new POC.
2. **Authentication** — a working, understandable auth pipeline (OTP sign-in, JWT access/refresh, roles) that a new POC can rely on as-is.
3. **Test base** — the testing setup (PGlite + `DataCooker`, real-DB unit/e2e tests) must keep working and stay easy to extend, since a new POC will lean on it from day one.

## Non-negotiables (never trade these for speed)
- Real SMS/email sending must actually be used for those integrations, not mocked/stubbed out, even under time pressure — this base is meant to prove the real integration path works, not a facade over it. (Tests are the exception: they intentionally mock these at the network boundary, per `.claude/rules/testing-js.md`.)
- **(Superseded 2026-09-18, KAN-6)** The S3-bucket non-negotiable above is dropped, not narrowed: file storage moved from S3 to PostgreSQL (see the ADR KAN-6 adds under `docs/decisions/`). A POC forked from this base after KAN-6 no longer proves an S3 integration path — if a future client engagement needs real object storage, that is a decision for that fork, not an assumption this base still makes.

## Explicitly out of scope (this phase)
- A specific client-facing product or business domain — none exists yet; the domain objects (`Account`, `Notification`, `File`, etc.) are deliberately generic.
- A `web/` frontend — planned per the root `README.md`, not started.
- CI/CD, staging and production environments — not defined in this repo yet.

## Judgement examples
| Situation | Decide this way | Because |
|-----------|-----------------|---------|
| Add a feature to `api/` that's genuinely generic (e.g. improve the auth pipeline) vs. one that's specific to a hypothetical future client | Build the generic version, keep client-specific logic out of this repo | goal 1 — this repo is the reusable base, not a specific product (rule G2) |
| Polish the seed/mock data vs. ship a new scaffolding piece faster | Prefer shipping the scaffolding piece; keep mocks "good enough" | goal 1 over goal 3 |
| A quick fix for a broken integration test vs. a quick mock that skips the real SMS call | Fix it against the real integration (or its sandbox) | non-negotiable above |

## Soft values
Optimize for a new POC being clonable and understandable in under a day — favor obvious, conventional
patterns over clever ones, since whoever forks this next may not have been part of writing it.
