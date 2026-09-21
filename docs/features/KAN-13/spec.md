# KAN-13 — [web] Auth pages

## Problem
`api/` has email + password auth (ADR-0011: `signUp`, `signIn`, `restorePassword`, `resetPassword`,
`changePassword`, `refreshToken`, `signOut`, plus the `account` query), but `web/` has no way to use it:
Apollo Client is installed and never instantiated (ADR-0008), and `app` only has placeholder routes. A
forked POC cannot sign a user in from the browser.

## Goal / business value
Ranked goal 2 (Authentication — a working pipeline a new POC can rely on as-is), delivered on top of
goal 1's `web/` scaffold: the client-side half of the flow, reusable from `web/shared`.

## Scope
- in:
  - `web/packages/app` pages: Sign in, Sign up, Forgot password, Restore password, Account (with a
    change-password form); a header showing the account email + Sign out when signed in, a Sign in link
    when not
  - `web/shared`: one Apollo client that sends the access token on every call, refreshes it on an
    authorisation failure and runs the sign-out process when refreshing fails; token storage in
    `localStorage`
  - GraphQL documents for the operations above, generated types via `pnpm --dir web run codegen`
  - API: enable CORS (env-driven origins) so the browser can call `/graphql` at all
- **out (explicit):**
  - `packages/admin` (shares the logic later, no pages or header now) — confirmed with the requester
  - Web test tooling (KAN-11); verification is typecheck + lint + build + a real browser run (rule W2)
  - Real email delivery, rate limiting, email verification, OTP sign-in UI (ADR-0011 accepted risks)
  - Any change to auth semantics in `api/` beyond CORS (e.g. the refresh-token bcrypt weakness in
    ADR-0011's open risks)
  - Changing the profile/email (`updateAccountProfile`) from the UI

## Acceptance criteria
- [ ] AC1 Given a registered email/password, when the user submits Sign in, then tokens are stored in
  `localStorage` and they land on the Account page; wrong credentials show an error and stay on the page
- [ ] AC2 Given a new email and an 8–72 byte password, when Sign up is submitted, then the user is signed
  in; a duplicate email shows an error
- [ ] AC3 Given an email, when Forgot password is submitted, then the same success message shows for known
  and unknown emails (calls `restorePassword`)
- [ ] AC4 Given `/restore-password?token=…`, when a new password is submitted, then `resetPassword`
  succeeds and the user is sent to Sign in; an invalid/expired token shows an error (calls `resetPassword`)
- [ ] AC5 Given a signed-in user, the Account page shows the email from the `account` query and a
  change-password form (`changePassword`); a wrong current password shows an error and does **not** sign
  the user out; on success the user is sent to Sign in (the API clears the refresh token, ADR-0011)
- [ ] AC6 Every GraphQL call carries `Authorization: Bearer <accessToken>` when a token exists
- [ ] AC7 Given an expired access token, when any call fails as unauthorised, then `refreshToken` is called
  once (concurrent failures share one refresh), the original call is retried and succeeds
- [ ] AC8 Given a failing refresh, then the sign-out process runs: `signOut` mutation, storage cleared,
  redirect to Sign in
- [ ] AC9 Header: signed out → "Sign in" link; signed in → account email (links to Account) + Sign out
  (mutation, clear storage, redirect to Sign in)
- [ ] AC10 Account page while signed out redirects to Sign in
- [ ] AC11 `pnpm --dir web` typecheck, lint, `app` build pass; API typecheck/lint/tests pass

## Edge cases
| Case | Expected behaviour | Decided by |
|------|--------------------|-----------|
| Ticket names swapped: "Forgot → `resetPassword`", "Restore → `restorePassword`" | Follow the API (ADR-0011): Forgot = `restorePassword(email)`, Restore = `resetPassword(token, newPassword)` | assumption |
| `signIn`/`signUp`/`changePassword`/`resetPassword` failures are also HTTP 401 (`INVALID_CREDENTIALS`, `INVALID_RESET_TOKEN`) | They must never trigger refresh or sign-out; those operations are excluded from the refresh path | plan (R3) |
| `signOut` itself fails (access token already dead) | Storage is still cleared and the user redirected; the failure is logged, not swallowed silently | plan |
| Two calls fail unauthorised at once | One shared refresh; both retried | plan |
| Reset token delivery | No real email (ADR-0011): a developer builds `/restore-password?token=<token from worker log>` by hand | ADR-0011 |
| Tokens on refresh success | Both access and refresh token replaced (API returns both) | assumption |

## Open questions
| # | Question | My assumed answer | Needs a human? |
|---|----------|-------------------|----------------|
| 1 | Refresh token also in `localStorage`? Ticket only names the access token | Yes — no other place exists without a backend change; XSS exposure is the accepted trade-off of the ticket's `localStorage` choice | yes (F2, security) — flagged in the plan |
| 2 | Exact error shape the API returns for an unauthorised call through Nest's Apollo driver | Determined by experiment in R3 before writing the detection logic | no |
| 3 | Where do Sign in/up pages redirect after success | Account page | no |
