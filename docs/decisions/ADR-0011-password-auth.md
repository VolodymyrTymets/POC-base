# ADR-0011 — Email + password auth alongside OTP, with a log-only email worker

- **Date:** 2026-09-21
- **Status:** accepted
- **Deciders:** volodymyr (plan approval and the two explicit decisions below)
- **Ticket:** KAN-12

## Context
ADR-0004 built phone + OTP sign-in and listed password auth as "not implemented" (the
`AccountIdentity.hash`/`salt` columns were unused). A forked POC needs the usual email + password
flow — register, sign in, change a password, recover a forgotten one — and the OTP flow is not a
substitute (`BUSINESS_MODEL.md` goal 2). This is additive: it does not reopen ADR-0004.

## Decision
- **Identity:** email is the login identifier for password accounts. `AccountProfile.email` is now
  `@unique` and stored trimmed + lowercased; a soft-deleted profile keeps its email reserved.
- **Mutations** (all in `AuthResolver`, logic in `JwtAuthStrategyService`): `signUp`, `signIn`,
  `changePassword`, `restorePassword`, and `resetPassword` (the second step of restore — one more than
  the ticket listed, agreed with the requester).
- **Passwords:** bcrypt (already a dependency), 10 rounds, hash + salt in `AccountIdentity.hash`/`salt`.
  Length is validated in **bytes**, 8 to 72, because bcrypt ignores everything past 72 bytes.
- **Reset token:** 256 random bits, stored only as a sha256 hash (`resetTokenHash`, `@unique`) with a
  30 minute expiry, single use. Consuming it is one conditional `updateMany`, so of two concurrent
  resets only one wins. A new `restorePassword` replaces a live token; a password change clears it.
- **No user enumeration on the read side:** `signIn` answers a wrong password, an unknown email, an
  OTP-only account and a soft-deleted account with the same `INVALID_CREDENTIALS` error (a dummy bcrypt
  compare keeps the timing alike); `restorePassword` answers every email the same way.
- **`isPhoneVerified`** is now set by `verifyOtp` only. Token issuance is shared with password sign-in
  and proves nothing about a phone (two existing assertions were flipped for this, KAN-12 R2).
- **Email delivery:** `NotifierTypes.EMAIL` → `EmailNotifierService` → BullMQ `EMAIL_QUEUE` (exponential
  backoff) → `email-sender` worker, which **only logs**.

## Deviation from `BUSINESS_MODEL.md` (decided by volodymyr, 2026-09-21)
The non-negotiable "real SMS/email sending must actually be used, not stubbed" is **relaxed for the POC
stage**: the email worker logs the message instead of sending it, and no provider is wired. The worker
writes the recipient and reset token only when `NODE_ENV` is `local`/`development`/`test`; elsewhere it
logs the account id only, so outside those environments the reset flow cannot be finished. The same
already holds for the SMS worker. A real provider would be a new runtime dependency (rule C2) and needs
its own ticket, not yet filed.

## Accepted risks (not fixed by this ADR)
| Risk | Why accepted here |
|------|-------------------|
| No rate limiting or lockout on `signIn`, `signUp`, `restorePassword` | Out of scope for the ticket; a fork exposed to real traffic must add it |
| No email verification on `signUp` — anyone can register or squat an email; `updateAccountProfile` can also set one | Out of scope; `@unique` then blocks the real owner |
| A duplicate `signUp` reveals that an email is registered | Unavoidable for a sign-up that reports conflicts |
| `restorePassword` does more work for a registered email than an unknown one (timing) | Not equalised; responses are identical |
| An access token stays valid for up to 15 minutes after a password change | JWTs are stateless in this base |
| The plaintext reset token travels in BullMQ job data (Redis) | The worker needs it to build the message |
| `NotifierService` fan-out logs a failed send and does not rethrow | A throw only for registered emails would leak which exist |
| `changePassword` has no `*AssertService` (rule P3) | The target is always the caller's own identity from the token, never a client-supplied id — same as `signOut` |
| **Refresh tokens are stored as a bcrypt hash of the whole JWT, and bcrypt only reads the first 72 bytes**, which are identical for every token of one account. Clearing the stored hash (sign-out, password change, reset) does reject older tokens, but the next sign-in stores a new hash that the older, still-valid tokens match again | **Existing behaviour, also affects OTP. Found live in KAN-12 and left open** — fixing it changes the OTP/refresh flows (rule B4), and it is a security decision (F2). Tracked as spec open question 6 |

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| One `restorePassword` mutation with an optional token | One mutation with two behaviours; harder to test and to read |
| bcrypt for the reset token | The token has 256 bits of entropy, so a slow hash adds cost without protection |
| Reusing `otpHash`/`otpExpiresAt` for the reset token | Would let an OTP and a reset token overwrite each other |
| Wiring a real email provider now | Explicitly declined for the POC stage (see the deviation above) |

## Consequences
- Positive: a forked POC gets a complete, tested password flow next to OTP, and the base still has no
  external auth dependency.
- Cost: the base now has two ways to sign in; `AccountIdentity` carries both OTP and password material.

## Revisit when
A real email/SMS provider is wired, when the API takes untrusted public traffic (rate limiting), or when
the refresh-token hashing is fixed — whichever comes first.
