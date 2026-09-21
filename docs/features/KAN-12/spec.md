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
- [x] AC1 Given a new email and valid password, when `signUp` runs, then a `CUSTOMER` `Account` +
      `AccountProfile` + `AccountIdentity` (bcrypt `hash`) exist and `AuthTokensEntity` is returned.
- [x] AC2 Given an email already registered (case-insensitive), when `signUp` runs, then it is rejected.
- [x] AC3 Given correct credentials, when `signIn` runs, then tokens are returned; wrong password and
      unknown email return the same `UNAUTHENTICATED` error.
- [x] AC4 Given a valid access token, when `changePassword` runs with the correct current password, then
      the hash changes, the old password stops working, and the stored refresh token is revoked.
- [x] AC5 `changePassword` with a wrong current password, or without a token, is rejected.
- [x] AC6 Given a registered email, when `restorePassword` runs, then a hashed single-use token with an
      expiry is stored and an email notification is queued. An unknown email returns the same success
      response and stores/queues nothing.
- [x] AC7 Given a valid token, when `resetPassword` runs, then the password changes, the token is
      consumed and the refresh token is revoked; an expired, used or unknown token is rejected.
- [x] AC8 The reset token is logged only by the log-only email worker and only in local/development/test
      (POC decision, no real provider); the OTP e2e suite still passes unchanged.
- [x] AC9 `sign-up`, `sign-in`, `change-password`, `restore-password` e2e specs exist and pass.

AC4 and AC7 hold as written (the stored refresh token is cleared), but older refresh tokens work again
after the next sign-in — see open question 6.

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
| 7 | Should changing the login email via `updateAccountProfile` require the current password? Today a live access token is enough, which combined with `restorePassword` is a permanent account takeover (self-review, security) | Not changed here — it alters the profile-update contract | **yes** |
| 8 | Should repeated `restorePassword` calls keep replacing a live token (lets an attacker keep invalidating the victim's token)? | Kept as specified; noted in ADR-0011 | **yes** |
| 6 | Refresh tokens are stored as a bcrypt hash of the whole JWT, but bcrypt only reads the first 72 bytes, which are identical for every token of one account. Clearing the stored hash rejects old tokens, but the next sign-in stores a new hash that the old tokens match again (found while running R5 live, existing behaviour, also affects OTP). Fix in this PR (hash refresh tokens with sha256) or a separate ticket? | Not fixed here (B4/F2); AC4/AC7 hold literally, revocation lasts only until the next sign-in | **yes** |
