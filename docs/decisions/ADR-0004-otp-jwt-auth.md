# ADR-0004 — JWT access/refresh auth with OTP sign-in

- **Date:** 2026-09-17 (recorded retroactively — not re-litigated)
- **Status:** accepted
- **Deciders:** recorded from existing code during `/setup`
- **Ticket:** —

## Context
The base needs a working authentication pipeline that a forked POC can rely on without changes
(`BUSINESS_MODEL.md` goal 2).

## Decision
Sign-in is phone-number + OTP based (`AuthResolver` → `OtpAuthStrategyService` →
`OtpCodeGeneratorService`, code hashed at rest, delivered via `NotifierService`/`SmsNotifierService`
through the `sms-sender` BullMQ worker). On verification, `JwtStrategyService`/`JwtAuthStrategyService`
issue an access token and a refresh token (`AuthTokensEntity`), validated per-request by `JwtStrategy`/
`JwtRefreshStrategy` and `GqlAuthGuard`. Role-based authorization layers on top via `RoleGuard` +
`@Roles(...)` (rule P3).

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| Password-based auth | Not implemented; `AccountIdentity.hash`/`salt` fields exist in the schema but no password sign-in flow was found wired up. |
| Third-party auth provider (Auth0, Clerk, etc.) | Not used — the base owns its own auth pipeline end to end, matching goal 2 (an auth pipeline a POC can rely on as-is, not an external dependency). |

## Consequences
- Positive: no external auth dependency; the whole flow is visible and forkable.
- Accepted cost: SMS delivery is a real external dependency for sign-in to work at all (see `BUSINESS_MODEL.md` non-negotiables — it must stay real, not mocked, outside tests).
- Follow-ups: `AccountIdentity.hash`/`salt` fields are unused by any observed flow — confirm whether a password path is planned or the fields should be removed.

## Revisit when
A forked POC needs a different primary sign-in method (email/password, SSO) — that's a new ADR in that fork, not a change here.
