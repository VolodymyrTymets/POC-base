# KAN-12 — [API] Auth workflow (password sign-in, sign-up, change, restore)

## Problem
An `Account` can only authenticate through phone + OTP (ADR-0004). The `AccountIdentity.hash`/`salt`
columns exist but no flow uses them, so a POC forked from this base has no email + password path:
no way to register, sign in, change a password, or recover a forgotten one.

## Goal / business value
`BUSINESS_MODEL.md` goal 2 (Authentication): "a working, understandable auth pipeline … that a new POC can
rely on as-is". Password auth is the piece a forked POC would otherwise rebuild first. Also goal 3: each
new mutation ships with an e2e spec that a fork can copy.

## Scope
- in: mutations `signUp`, `signIn`, `changePassword`, `restorePassword`, plus `resetPassword` (the second
  step of restore, agreed with the requester — one more than the ticket's list).
- in: email is the login identifier for password accounts; `AccountProfile.email` becomes unique (lowercased).
- in: an email notification path (`NotifierService` → BullMQ email queue → worker) whose worker only logs
  for now, as the ticket allows.
- in: e2e specs for all five mutations, unit specs for the new service methods and the worker.
- **out (explicit):** a real email provider/SMTP (ticket: "read email service out of scope"); email
  verification on sign-up; rate limiting / lockout; password-strength rules beyond length; 2FA;
  merging a password account with an OTP account for the same person; any `web/` screen; changing the
  OTP flow's behaviour.

## Acceptance criteria
- [ ] AC1 Given a new email and valid password, when `signUp` runs, then a `CUSTOMER` `Account` +
      `AccountProfile` + `AccountIdentity` (bcrypt `hash`) exist and `AuthTokensEntity` is returned.
- [ ] AC2 Given an email already registered (case-insensitive), when `signUp` runs, then it is rejected.
- [ ] AC3 Given correct credentials, when `signIn` runs, then tokens are returned; wrong password and
      unknown email return the same `UNAUTHENTICATED` error.
- [ ] AC4 Given a valid access token, when `changePassword` runs with the correct current password, then
      the hash changes, the old password stops working, and the stored refresh token is revoked.
- [ ] AC5 `changePassword` with a wrong current password, or without a token, is rejected.
- [ ] AC6 Given a registered email, when `restorePassword` runs, then a hashed single-use token with an
      expiry is stored and an email notification is queued. An unknown email returns the same success
      response and stores/queues nothing.
- [ ] AC7 Given a valid token, when `resetPassword` runs, then the password changes, the token is
      consumed and the refresh token is revoked; an expired, used or unknown token is rejected.
- [ ] AC8 The reset token is logged only by the log-only email worker and only in local/development/test
      (POC decision, no real provider); the OTP e2e suite still passes unchanged.
- [ ] AC9 `sign-up`, `sign-in`, `change-password`, `restore-password` e2e specs exist and pass.

## Edge cases
| Case | Expected behaviour | Decided by |
|------|--------------------|-----------|
| Email differs only by case | Lowercased on write and lookup | assumption |
| Email has leading/trailing whitespace | Rejected by `@IsEmail` before the service runs (found while executing R3); the service still trims defensively | code finding |
| Password > 72 bytes | Rejected by validation (bcrypt silently truncates beyond 72) | assumption |
| OTP-only account (no `hash`) tries `signIn` | Same generic `UNAUTHENTICATED` | assumption |
| OTP-only account with an email uses `restorePassword` | Allowed — this is how it gets a first password | assumption |
| Second `restorePassword` while a token is live | New token replaces the old | assumption |
| Password sign-in must not mark the phone verified | `isPhoneVerified` set only by `verifyOtp` (see plan R2) | code finding |

## Open questions
| # | Question | My assumed answer | Needs a human? |
|---|----------|-------------------|----------------|
| 1 | Restore shape | Two mutations: `restorePassword`, `resetPassword` | answered by requester |
| 2 | Unique email | `@unique` on `AccountProfile.email` via migration | answered by requester |
| 3 | Reset-token TTL | 30 minutes | no |
| 4 | Min password length | 8 | no |
| 5 | Auth/security decisions (F2) | Plan approval is the human sign-off for the security choices above | yes — at approval |
