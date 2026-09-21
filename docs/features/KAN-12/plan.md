# KAN-12 — implementation plan

<!-- A human writes this line to approve. Until it is here, guard-plan-approval blocks writes to code.
     A deliberate exception is written the same way, with its reason:
     Approved-by: spike, no review — KAN-12 -->
Approved-by: volodymyr · 2026-09-21

Pattern followed: `api/src/auth/services/otp-auth-strategy/otp-auth-strategy.service.ts` +
`api/src/auth/auth.resolver.ts` (`signInOtp`/`verifyOtp`) — strategy service extending
`JwtStrategyService`, thin resolver, DTOs with class-validator, dev-only secret echo gated on `NODE_ENV`.
Notification path follows `SmsNotifierService` → `sms-sender` worker. E2E follows
`api/test/auth/sign-in-otp.e2e-spec.ts` (`DataCooker` + PGlite, real DB). ADR-0004 lists password auth as
not implemented, not as rejected, so this needs a new ADR (R8), not a reopened decision.

## Contract changes
- boundary (additive GraphQL): mutations `signUp`, `signIn`, `changePassword`, `restorePassword`,
  `resetPassword`. New inputs/entity: `SignUpInput`, `PasswordSignInInput`, `ChangePasswordInput`,
  `RestorePasswordInput`, `ResetPasswordInput`, `RestorePasswordEntity {success, token?}` (token only when
  `NODE_ENV` is local/development/test, as `signInOtp` does with `code`). No existing consumer breaks.
- data: `AccountProfile.email` gains `@unique`; `AccountIdentity` gains `resetTokenHash String? @unique`,
  `resetTokenExpiresAt DateTime?`. Forward-only migration via `pnpm --dir api run prisma-migrate` (local,
  rule C5). Rollback is a follow-up migration dropping them; no backfill (nullable columns, no prod data).
- generated output: `api/generated/prisma/**` via `pnpm --dir api run prisma-gen`; `api/schema.gql`
  regenerates on boot (S3). Neither is hand-edited.

## Requirements (ordered, each independently verifiable)

### R1 — Schema: unique email, reset-token columns (S)
- files: `api/prisma/models/account.prisma` (change), new migration under `api/prisma/migrations/` (generated)
- layer: data
- test: none directly — proven by R2–R7 running against it; inspect `migration.sql` is only the unique
  indexes + two `ADD COLUMN`s
- executed how: `prisma-gen`, then `prisma-migrate` against the local DB
- risk: existing dev rows with duplicate emails would fail the unique index — check with a query first.
  The `.sql` is produced only by `prisma-migrate`, never hand-written; the `account.prisma` edit is an
  "ask first" path, so the approver confirms it here
- also: `account-profile.service.ts` `updateAccountProfile` writes `email` un-normalised, which would let a
  mixed-case duplicate in and could throw a raw `P2002`. It gets the same trim + lowercase, and a
  duplicate maps to a domain error (D5); covered by an added case in `update-account-profile.e2e-spec.ts`

### R2 — Decouple `isPhoneVerified` from token issuance (S)
- files: `api/src/auth/services/jwt-strategy/jwt-strategy.service.ts` (change: drop the
  `accountProfile.update({isPhoneVerified: true})`), `.../otp-auth-strategy.service.ts` (change: set it in
  `verifyOtp` after the OTP is verified)
- layer: service
- test: `sign-in-otp.e2e-spec.ts` and `otp-auth-strategy.service.spec.ts` keep passing; the new
  `verifyOtp` case asserts `isPhoneVerified === true`. **Two existing assertions are moved, not weakened
  (B3, needs the approver's eye):** `jwt-strategy.service.spec.ts:122` and
  `jwt-auth-strategy.service.spec.ts:163` ("should mark account phone as verified" via
  `refreshTokens`/`refreshToken`) now assert the opposite: token issuance leaves the flag untouched. Each
  carries `WHY: KAN-12 — verification belongs to verifyOtp, password sign-in must not verify a phone`.
  A negative test also covers password `signIn`
- executed how: e2e run of `sign-in-otp`; without this, a password sign-in would mark a phone verified
- risk: `refreshToken` mutation no longer touches the flag — harmless, it was already true after OTP

### R3 — `signUp` (M)
- files: `api/src/auth/dto/sign-up.input.ts` (new), `api/src/auth/services/jwt-auth-strategy/jwt-auth-strategy.service.ts`
  (change: `signUp`, bcrypt hash into `AccountIdentity.hash`/`salt`), `api/src/account/account.service.ts`
  (change: `createPasswordAccount(email)` reusing the role-assignment of `createCustomerAccount`),
  `api/src/auth/auth.resolver.ts` (change: mutation), `api/src/auth/auth.module.ts` (change: providers if needed)
- layer: resolver → service → Prisma. `AccountRoleService.addAccountToRole` uses the caching client and
  cannot join a transaction, so `createPasswordAccount` does **one nested `account.create`**
  (`AccountProfile`, `AccountIdentity` with the bcrypt hash, `AccountOnRole: { create: { roleId } }`), the
  `CUSTOMER` role id looked up first. One statement is atomic on its own (backend-core 11). The email
  lookup ignores soft-deleted rows (P2), and the pre-check is backed by the `@unique` for races
- test: `api/test/auth/sign-up.e2e-spec.ts` (AC1, AC2, invalid email, short/over-72-byte password),
  unit spec in `jwt-auth-strategy.service.spec.ts` incl. a failed identity write leaving no account behind
- executed how: real `signUp` mutation against a running server (curl) + the e2e spec
- risk: duplicate error reveals that an email is registered — accepted, noted in the ADR

### R4 — `signIn` (S)
- files: `api/src/auth/dto/password-sign-in.input.ts` (new), `jwt-auth-strategy.service.ts` (change),
  `auth.resolver.ts` (change)
- layer: resolver → service
- test: `api/test/auth/sign-in.e2e-spec.ts` (AC3: ok, wrong password, unknown email, OTP-only account —
  identical `UNAUTHENTICATED`)
- executed how: `signUp` then `signIn` against the running server; use the token on the `account` query
- risk: unknown-email path must still run a dummy bcrypt compare to avoid a timing side channel

### R5 — `changePassword` (M)
- files: `api/src/auth/dto/change-password.input.ts` (new), `jwt-auth-strategy.service.ts` (change),
  `auth.resolver.ts` (change: `@UseGuards(GqlAuthGuard)`, `@CurrentAccount()`)
- layer: resolver → service
- test: `api/test/auth/change-password.e2e-spec.ts` (AC4, AC5: old password stops working, refresh token
  revoked, no-token rejected)
- executed how: running server, full sign-up → change → sign-in-with-old (fails) → sign-in-with-new
- risk: P3 asks for an assert-service layer; the target record is always the caller's own identity taken
  from the token (no client-supplied id), so ownership is inherent — same as `signOut`. **Raising this
  as a P3 deviation for the reviewer**, not silently skipping it.

### R6 — Email notification path (M)
- files: `api/src/notifier/notifier.service.interface.ts` (change: `NotifierTypes.EMAIL`,
  `notifyAboutPasswordReset`), `api/src/notifier/email-notifier.service.ts` (new), `notifier.service.ts`
  + `sms-notifier.service.ts` + `log-notifier.service.ts` (change: wire/implement no-op),
  `api/src/notifier/notifier.module.ts` (change: register queue),
  `api/src/background-workers/email-sender/{email-sender.module,email-sender.service,email.queue.constants}.ts`
  (new), `api/src/background-workers/worker.module.ts` (change: queue registered with exponential `backoff`;
  a retried job only re-sends the same email, so it is idempotent — backend-core 20)
- layer: notifier + background worker
- test: `email-sender.service.spec.ts` (job processed; per the user's decision the worker logs the whole
  message — recipient, reset token/link — via `Logger` (not `console.*`), and only when `NODE_ENV` is
  local/development/test, as `LogNotifierService` does; asserts nothing is logged otherwise);
  notifier unit spec
- executed how: run the `worker` and `api` together, trigger R7's `restorePassword`, see the worker log
- risk: the plaintext reset token travels in BullMQ job data (Redis) because the worker needs it to build
  the link — accepted, recorded in the ADR. Size: R6 is the largest piece and could split into its own PR
  (A4); the approver decides. The worker uses `Logger` (not `console.*`, backend-core rules 19/20); `NotifierService` swallows
  send errors (existing behaviour) so a failed reset email is silent — flagged in the ADR, not changed here

### R7 — `restorePassword` + `resetPassword` (M)
- files: `api/src/auth/dto/{restore-password,reset-password}.input.ts`,
  `api/src/auth/entities/restore-password.entity.ts` (new), `jwt-auth-strategy.service.ts` (change: token =
  `randomBytes(32)`, store sha256 in `resetTokenHash`, TTL 30 min, single use), `auth.resolver.ts` (change)
- layer: resolver → service → notifier
- test: `api/test/auth/restore-password.e2e-spec.ts` (AC6, AC7: unknown email indistinguishable, expired
  token via DB-set expiry, reused token, new password works, refresh token revoked)
- executed how: running server: restore → read dev-only `token` → reset → sign-in with new password
- risk: token echoed in the response only under local/development/test, mirroring `signInOtp` but reading
  `NODE_ENV` via `ConfigService` (backend-core 7), not `process.env`; also asserts a second
  `restorePassword` replaces a live token

### R8 — Docs (S)
- files: `docs/decisions/ADR-0011-password-auth.md` (new), `docs/decisions/ADR-0004-otp-jwt-auth.md`
  (change: link the follow-up on unused `hash`/`salt`), `docs/ARCHITECTURE.md` (change: flow 4 + email
  queue), `docs/DOMAIN_GLOSSARY.md` (change: reset token, password identity), spec checklist ticked

## Docs to update in this PR
- [ ] docs/features/KAN-12/spec.md (acceptance criteria checked off)
- [ ] docs/ARCHITECTURE.md — password flow, email queue/worker
- [ ] docs/DOMAIN_GLOSSARY.md — password reset token, email identifier
- [ ] docs/decisions/ADR-0011 — password auth choices (bcrypt, hashed reset token, non-enumeration)

## Risks
| Risk | Impact | Cheapest way to find out early |
|------|--------|-------------------------------|
| Log-only email worker deviates from the BUSINESS_MODEL "real sending" non-negotiable | Reset flow only usable where the token is logged/echoed (local/dev/test) | **Decided by volodymyr, 2026-09-21:** POC stage, log to console, no real provider now; recorded in ADR-0011 with a follow-up ticket for a real provider |
| Auth/security decisions (hashing, token design, no rate limiting) | Weak default for every fork (rule F2) | Human reads spec "Open questions" #5 at approval |
| Unique-email migration fails on existing rows | Blocks R1 and everything after | `SELECT email, count(*) … HAVING count(*) > 1` on the local DB before migrating |
| Baseline `tsc`/e2e may already fail (docs cite KAN-4/68 type errors; the `Customers` grep now finds nothing) | Can't tell new failures from old | Run typecheck + unit + e2e once before R1 and record the baseline |
| Verification runs on Node v24.16.0, pinned is 22.16.0 (T2) | Version caveat on all evidence | Per saved preference: proceed on local Node and state the caveat in the report |

## Assumptions
- Email is the login identifier; phone stays the OTP identifier. TTL 30 min; min password length 8.
- bcrypt (already a dependency, C2) with the existing 10 rounds; the salt goes in `salt` as the OTP flow does.
- Return types: `signUp`/`signIn` → `AuthTokensEntity`; `changePassword`/`resetPassword` → `Boolean`
  (like `signOut`), the refresh token is revoked so the client signs in again. `createPasswordAccount` maps
  `P2002` to a domain error; a soft-deleted account keeps its email reserved (no partial unique index).
- ADR-0011 records the accepted risks: no email verification (email squatting), `restorePassword` timing
  difference, access token valid ~15 min after a password change, no assert service on `changePassword`
  (P3), no rate limiting, duplicate-`signUp` enumeration, plaintext reset token in Redis job data, and the
  PR body lists the two moved B3 assertions.
- Errors use the `src/common/errors.ts` constants (backend-core 8). Evidence per R3–R7 = the real
  request/response from the running server plus the passing e2e spec (B5).
- E2E files follow the repo's `*.e2e-spec.ts` naming, not the ticket's `.e2e.test`.
- Estimate: 4×S/M-small, 4×M — about a day, at the edge of F2's "more than a day" trigger.
