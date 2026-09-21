# ADR-0012 — Web auth client: localStorage tokens, refresh-on-unauthorised, CORS

- **Date:** 2026-09-21
- **Status:** accepted
- **Deciders:** volodymyr (plan approval, CORS-in-the-API and app-only scope)
- **Ticket:** KAN-13

## Context
`web/` had Apollo Client installed but never wired (ADR-0008) and `api/` had password auth (ADR-0011)
with no browser consumer. KAN-13 adds the auth pages to `web/packages/app` and, with them, the first
real GraphQL client. No web precedent existed, so the choices below are new.

## Decision
- **Where the code lives:** the Apollo client, token storage, refresh and sign-out live in `web/shared/api/`
  (`apollo-client.ts`, `auth/token-storage.ts`, `auth/session.ts`) with no React or router import, so
  `packages/admin` can adopt them unchanged. Pages, the session provider and the form components live in
  `web/packages/app/src/`. The form components are *not* in `web/shared/components/` because `web/shared`
  has no `react` dependency and adding one is a `package.json` change for a follow-up.
- **Token storage:** both the access token and the refresh token are kept in `localStorage`
  (`poc.accessToken`, `poc.refreshToken`). The ticket asked for the access token there; the refresh token
  had no other place without a backend change, so it follows.
- **Sending the token:** a `SetContextLink` adds `Authorization: Bearer <accessToken>` to every call.
- **Refresh:** an `ErrorLink` placed *before* that link, so a retried operation is re-authorised with the new
  token. It reacts only to a GraphQL error with `extensions.code === 'UNAUTHENTICATED'` **and** the bare
  message `Unauthorized`. Concurrent failures share one in-flight `refreshToken` call.
- **Why the message check matters:** the API returns a wrong password (`INVALID_CREDENTIALS`), a wrong
  current password and a bad reset token (`INVALID_RESET_TOKEN`) with the same `UNAUTHENTICATED` code as an
  expired access token, as HTTP 200 (measured in KAN-13). The code alone would sign a user out for mistyping
  their current password. The auth operations (`SignIn`, `SignUp`, `RestorePassword`, `ResetPassword`,
  `RefreshToken`, `SignOut`) are also never retried.
- **Failure:** if the refresh fails (or no refresh token exists) the sign-out process runs: `signOut`
  mutation (best effort — the access token is usually dead by then and the failure is logged), clear
  storage, clear the Apollo cache, redirect to Sign in. Refresh and sign-out use a second Apollo client
  without the error link so a failing refresh cannot recurse.
- **The API's `refreshToken` reads `x-refresh-token`**, not `Authorization`.
- **A password change or reset ends the session in the UI**, because the API clears the stored refresh
  token (ADR-0011): the session could not be refreshed later. Sign in shows a one-line notice.
- **CORS:** `api/src/main.ts` enables it for `CORS_ORIGINS` (comma-separated), defaulting to the two local
  web origins (`http://localhost:5173`, `:5174`). The env templates are protected paths, so the variable is
  documented in `docs/RUNBOOK.md` rather than added to them.
- **No new dependencies:** `Observable` is re-exported by `@apollo/client`, so the retry link needs no
  direct `rxjs` import; the app reaches Apollo's React bindings through `web/shared/api/react.ts`.

## Rejected alternatives
| Alternative | Why not |
|-------------|---------|
| Vite dev proxy instead of CORS | Different target on host vs container, and no help for a real deployment |
| Refresh on any `UNAUTHENTICATED` | Signs the user out on a mistyped current password |
| httpOnly cookie for the refresh token | Needs an API change (cookie issuing, CSRF); out of scope for the ticket |
| Form components in `web/shared/components/` | `web/shared` has no `react` dependency |

## Accepted risks
- **Tokens in `localStorage` can be read by any script running on the page.** An XSS bug means account
  takeover. Accepted because the ticket specifies it; a fork handling real data should move the refresh
  token to an httpOnly cookie.
- The API's existing weakness with refresh tokens (ADR-0011's open risk: a bcrypt hash of the JWT's first
  72 bytes) is not changed here.
- Refresh is single-flight per tab only. Two tabs refreshing at once means one presents an already-rotated
  refresh token and fails, which signs out the shared `localStorage` session in both (the API stores one
  refresh token per account, ADR-0011).
- No web tests yet (KAN-11); the flows were verified by hand in a browser (see the KAN-13 PR).

## Consequences
- A forked POC gets a working, documented client-side auth flow and a reusable client for any new app.
- The two apps must set `CORS_ORIGINS` when `set-ports.sh` moves their ports.
