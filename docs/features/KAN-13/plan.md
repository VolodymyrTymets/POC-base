# KAN-13 — implementation plan

<!-- A human writes this line to approve. Until it is here, guard-plan-approval blocks writes to code.
     A deliberate exception is written the same way, with its reason:
     Approved-by: spike, no review — KAN-13 -->
Approved-by: volodymyr · 2026-09-21

Pattern followed: no web precedent exists (KAN-5 was a pure scaffold, ADR-0008 says Apollo is "installed but
not wired"), so the shape is Apollo Client 4's documented link chain (`SetContextLink` + `ErrorLink` retry,
verified via Context7 `/apollographql/apollo-client` v4.0.5), placed in `web/shared` per ADR-0008's split.
The new-pattern rule (D1) means R7 adds an ADR. API side follows `AuthResolver`'s existing mutations —
nothing new there except CORS.

## Contract changes
- boundary: **no GraphQL schema change.** New browser-facing surface: CORS on the API (additive). `web/`
  starts consuming `signIn`, `signUp`, `restorePassword`, `resetPassword`, `changePassword`, `refreshToken`
  (needs header `x-refresh-token`, not `Authorization`), `signOut`, query `account`.
- data: none.
- generated output: `web/shared/api/generated/**` via `pnpm --dir web run codegen` (reads `api/schema.gql`,
  which already contains all of these operations). Never hand-edited (W3).

## Requirements (ordered, each independently verifiable)

### R0 — Probe before code (S)
- boot the API (`pnpm --dir api run start:dev`); if it does not boot (KAN-4), stop and report (B4)
- record the exact error for `account` with no token and with an expired token (HTTP status, `errors[0]`)
- evidence: pasted request/response in the PR body; feeds R3's detection logic and spec open question 2

Evidence per requirement (B5): R1 preflight `curl` request/response · R2 codegen + typecheck output ·
R3 the R0 error-shape record · R4–R6 browser screenshots and `localStorage` before/after.

### R1 — CORS in the API (S)
- files: `api/src/main.ts` (change: `app.enableCors({ origin })`, origins from `CORS_ORIGINS`
  comma-separated, default `http://localhost:5173,http://localhost:5174`)
- layer: bootstrap. Not business logic; no `context`/`req` leakage (S2)
- test: e2e if the suite boots (KAN-4 landmine — otherwise report "not verified"): `OPTIONS /graphql` with an
  allowed `Origin` returns `access-control-allow-origin`; a foreign origin does not
- executed how: run the API, `curl -i -X OPTIONS -H 'Origin: http://localhost:5173'
  -H 'Access-Control-Request-Headers: authorization,x-refresh-token' http://localhost:3001/graphql`
- risk: the env templates (`api/.env*.example`) match the protected `.env.*` pattern, so the var is **not**
  added there — the default covers local dev, RUNBOOK documents `CORS_ORIGINS` for `set-ports.sh` stacks and a
  human adds it to the templates. Staging/prod origins are not defined (no such env exists)

### R2 — GraphQL documents + codegen (S)
- files: `web/shared/api/auth/{mutations,queries}.ts` (new: one `graphql(...)` document per operation, each
  selecting only what the UI reads), generated output regenerated
- layer: shared data-access (mirrors `web/shared/api/ping/queries.ts`)
- test: `tsc --noEmit` — typed documents fail to compile if the schema and documents disagree
- executed how: `pnpm --dir web run codegen` then `pnpm --dir web -r exec tsc --noEmit && pnpm --dir web run typecheck`
- risk: none. `ping/queries.ts` stays (its comment says "not imported yet"; left alone, C1)

### R3 — Auth core in `web/shared`: token storage, Apollo client, refresh, sign-out (L)
- files: `web/shared/api/auth/token-storage.ts` (new: get/set/clear, every `localStorage` access in
  try/catch), `web/shared/api/apollo-client.ts` (new: `SetContextLink` adds the header, `ErrorLink` refreshes
  and retries), `web/shared/api/auth/session.ts` (new: single-flight `refresh()`, `signOut()`)
- layer: shared data-access; no UI. `package.json` exports may need a `./api/*` glob to reach subfolders
  (`web/shared/package.json` is "ask first" — approver confirms)
- design points that are load-bearing:
  - Refresh and forced sign-out go through a **bare client** (no `ErrorLink`), else a failing refresh
    re-enters the handler and loops
  - Operations `signIn`, `signUp`, `restorePassword`, `resetPassword`, `refreshToken`, `signOut` are excluded
    from the refresh path, and a 401 whose message is `INVALID_CREDENTIALS`/`INVALID_RESET_TOKEN` is an
    ordinary error — the API returns those as 401 too (`jwt-auth-strategy.service.ts:107,112,129,137,223`),
    so `changePassword` with a wrong current password would otherwise sign the user out
  - One in-flight refresh promise shared by concurrent failures; retry the operation once (Apollo's
    `ErrorLink` retries an operation only once by design)
  - Forced sign-out clears storage even when `signOut` fails (the access token is dead by then) and logs
    the failure; the redirect goes through a callback the app registers, so `web/shared` does not import
    `react-router`
- test: none available (W2). Proven by R5's browser run
- executed how: **first**, before writing detection: boot the API, run an `account` query with no token and
  an expired token, record the exact `errors[0].extensions` / HTTP status, and write that into the code
  comment and spec open question 2
- risk: error shape unknown until that experiment (see Risks)

### R4 — App shell: providers, router, header, route guard (M)
- files: `web/packages/app/src/main.tsx` (change: `ApolloProvider`), `web/packages/app/src/App.tsx`
  (change: routes, drops the placeholder Home/About), `web/packages/app/src/session/SessionProvider.tsx` +
  `RequireAuth.tsx` (new), `web/packages/app/src/components/Header.tsx` (new)
- layer: app UI; state in `SessionProvider` (signed-in flag from storage, `account` query for the email)
- test: none (W2) — typecheck + lint + browser
- executed how: dev server; signed out shows "Sign in", signed in shows email + Sign out, `/account`
  redirects when signed out
- risk: none

### R5 — Sign in, Sign up (M)
- files: `web/packages/app/src/pages/{SignIn,SignUp}.tsx` (new), `web/shared/components/` (new small
  `TextField`/`Button`/`FormError`, plain Tailwind — no form library, C2), route entries in `App.tsx`
- layer: app UI + shared components
- test: none (W2). Client-side checks mirror the API (email shape, 8–72 **bytes**) for UX only; the API stays
  the authority
- executed how: real browser against a running API: sign up, see tokens in `localStorage`, sign out, sign in,
  wrong password error, duplicate email error
- risk: none

### R6 — Forgot, Restore, Account + change password (M)
- files: `web/packages/app/src/pages/{ForgotPassword,RestorePassword,Account}.tsx` (new), routes
- layer: app UI
- test: none (W2)
- executed how: browser: Forgot shows the same message for known/unknown email; read the token from the
  `worker` log, open `/restore-password?token=…`, reset, sign in with the new password; on Account change the
  password (wrong current password errors and stays signed in); then AC7/AC8 — expire the access token
  (edit `localStorage`), reload Account (refresh + retry works), then corrupt the refresh token (sign-out
  redirect happens)
- risk: after `changePassword`/`resetPassword` the API clears the stored refresh token (ADR-0011), so the
  current session dies at the next refresh — Account signs the user out on success and sends them to Sign in

### R7 — Docs (S)
- files: `docs/decisions/ADR-0012-web-auth-client.md` (new), `docs/ARCHITECTURE.md` (change: web
  entry/flows, CORS), `docs/RUNBOOK.md` (change: `CORS_ORIGINS`, reset-link-by-hand), `docs/DOMAIN_GLOSSARY.md`
  (no new domain term — checked), `docs/features/KAN-13/spec.md` (tick ACs)
- `CLAUDE.md` is "ask first" and unchanged unless the approver wants the auth pages mentioned

## Docs to update in this PR
- [ ] docs/features/KAN-13/spec.md (acceptance criteria checked off)
- [ ] docs/ARCHITECTURE.md — web now calls the API, CORS
- [ ] docs/decisions/ADR-0012 — token storage, refresh design, CORS decision
- [ ] docs/RUNBOOK.md — `CORS_ORIGINS`, how to finish the reset flow

## Risks
| Risk | Impact | Cheapest way to find out early |
|------|--------|-------------------------------|
| Unauthorised error shape through Nest's Apollo driver is unknown (HTTP 401 vs GraphQL error code) | Refresh never fires, or fires on the wrong errors | R3's first step: one curl per case against a running API |
| Wrong-credentials 401s trigger refresh/sign-out (see R3) | `changePassword` mistyped password logs the user out | Explicit browser case in R6 |
| API may not boot: docs list the missing `Customer` model (KAN-4) as crashing `start:dev` | Cannot run any browser check | `pnpm --dir api run start:dev` first thing; if it fails, stop and report (B4) rather than fix here |
| Tokens in `localStorage` are readable by any script on the page (XSS) | Account takeover if XSS ever lands | Accepted by the ticket; refresh token in storage is my extension — needs approver sign-off (F2) |

## Assumptions
- Forgot = `restorePassword`, Restore = `resetPassword` (ticket names are swapped vs the API; ADR-0011 rules)
- `app` only; `admin` untouched (confirmed). CORS via API, not a Vite proxy (confirmed)
- Node/tooling versions: verification runs on the host Node unless the pinned 22.16.0 is available (T2) —
  any mismatch is reported, not worked around
- No new runtime dependencies (`@apollo/client/link/context|error` ship with Apollo; C2)
