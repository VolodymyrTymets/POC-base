# KAN-6 — Files saving

## Problem
`File` bytes today live in S3, reached through a presigned-URL dance (`createFile` returns an
`uploadUrl` the client PUTs to directly; `publicUrl` returns a presigned GET). For a POC base this is
one more piece of infrastructure (an S3 bucket, AWS credentials) a new fork has to provision before the
`File` flow works at all. The ticket asks to drop that dependency and make PostgreSQL — already the
single source of truth for every other domain table (`ARCHITECTURE.md`) — the source of truth for file
bytes too, via the existing `File` model.

## Goal / business value
Goal 1, project scaffolding (`BUSINESS_MODEL.md`): fewer external services a forked POC must stand up
before the base's own features work end to end. This also required updating the BUSINESS_MODEL.md
non-negotiable that previously named S3 as a required real integration — done ahead of this plan (see
"Constitution change" below), since a plan cannot be approved against a constitution it would violate on
day one.

## Constitution change (prerequisite, already applied)
`docs/BUSINESS_MODEL.md`'s non-negotiable "a real S3 bucket must actually be used" was superseded on
2026-09-18 (human decision, plan-approval round) — see the new note in that file and
`docs/decisions/ADR-0010-postgres-file-storage.md` (plan.md R9). The SMS non-negotiable is untouched.

## Scope
- in: remove `S3ManagerService`/`@aws-sdk/*`/`aws-sdk`/`aws-sdk-v3-nest`; add a `content Bytes?` column
  to `File`; `createFile`/`updateFile` accept file bytes as base64 in their GraphQL input; the `publicUrl`
  field resolver returns a `data:` URI built from the stored bytes instead of a presigned S3 GET URL;
  update `files.service.ts`, `files.resolver.ts`, `files.module.ts`, DTOs, tests, docs.
- **out (explicit):**
  - Streaming/multipart upload or a REST download endpoint — out of scope per the plan-approval decision
    (base64-in-GraphQL was chosen over adding a first REST route to this GraphQL-only API).
  - ~~Changing `FileStatus`'s upload-lifecycle state machine...~~ **Amended, second self-review round:**
    `FileStatus` is removed entirely, not kept as-is — see `docs/decisions/ADR-0010-postgres-file-storage.md`'s
    "Amendment" section. Once content arrives synchronously (this ticket's whole point), presence of
    `content` already carries the state a separate field would have duplicated.
  - Any change to `AccountProfile`'s use of `File` (avatar) beyond what follows automatically from the
    `File` contract change.
  - File size/mime-type limits beyond the existing `FileAssertService` checks (`FILE_MAX_SIZE`,
    `FILE_ALLOWED_MIME_TYPES`) — unchanged.

## Acceptance criteria
- [x] AC1 `S3ManagerService`, `IS3ManagerService`, and every `@aws-sdk/*`/`aws-sdk`/`aws-sdk-v3-nest`
      reference are removed from `api/src/files/**` and `api/package.json`.
- [x] AC2 `createFile` accepts an optional base64 `content` input; when provided, the bytes are persisted
      to the `File.content` column in the same call (no separate "upload" step against external storage
      remains meaningful). **Amended:** the original criterion said `FileStatus` moves to
      `FILE_STATUS_UPLOAD_COMPLETED` — `FileStatus` no longer exists (ADR-0010 amendment); this is now
      moot rather than unmet.
- [x] AC3 `updateFile` can also accept `content` (matching `CreateFileInput`, which it already extends),
      to cover a client that creates the record first and attaches bytes in a second call. **Amended:**
      a client attaching content on `updateFile` no longer has to resend `mimeType` — `FileAssertService`
      falls back to the record's stored `mimeType` (bug found in a second review round, fixed).
- [x] AC4 The `publicUrl` field resolver on `FileEntity` returns a `data:<mimeType>;base64,<content>` URI
      built from the stored bytes, or `null` when no content is stored yet. Resolves correctly whether
      `publicUrl` is requested directly or through a GraphQL fragment (bug found in a second review round,
      fixed).
- [x] AC5 `api/prisma/models/files.prisma` gains `content Bytes?`; `key` (the S3 object key) is removed
      since it no longer refers to anything. **Amended:** `status`/`FileStatus` is also removed (ADR-0010
      amendment) — not part of the original AC5, added by the same migration wave.
- [x] AC6 `upload-file.e2e-spec.ts` and its supporting mocks/helpers pass against the new contract with no
      S3 mock involved.
- [x] AC7 `pnpm --dir api exec tsc --noEmit`, `pnpm --dir api run lint`, and the unit/e2e suites all run
      clean of *new* errors (pre-existing baseline failures from the documented Customer-model bug are not
      this ticket's to fix — `ARCHITECTURE.md` known landmines, rule B4).

## Edge cases
| Case | Expected behaviour | Decided by |
|------|--------------------|-----------|
| `createFile` called with no `content` (record created, bytes attached later via `updateFile`) | Record is created with `content: null`; `publicUrl` resolves to `null` until content arrives | Preserves the existing two-step create-then-update flow the tests already exercise |
| `content` larger than `FILE_MAX_SIZE` | Rejected by `FileAssertService.assertFileInput`, same as today's `size` check, applied to the decoded byte length | Existing validation pattern, extended not replaced |
| `updateFile` called by an account that doesn't own the file | Same `ForbiddenException` as today, unchanged — `FileAssertService.assertUpdateFile` already scopes by `createdById` | No change needed, already covers `content` since it extends `CreateFileInput` |
| Malformed base64 in `content` | Rejected at the DTO boundary with a validation error, not a silent empty buffer | Rule D5 — errors are never swallowed |

## Open questions
| # | Question | My assumed answer | Needs a human? |
|---|----------|-------------------|----------------|
| 1 | BUSINESS_MODEL.md's S3 non-negotiable conflicts with this ticket's AC | Supersede the non-negotiable, documented in place, ADR added in this PR | **Asked — human chose "pause and update BUSINESS_MODEL.md first"; applied** |
| 2 | How do file bytes get into/out of Postgres with no S3 presigned URL and no REST route in this API | Base64 in the GraphQL mutation input; `data:` URI out via `publicUrl` | **Asked — human confirmed both recommended options** |
| 3 | Does `key` (S3 object key) still serve a purpose | No — dropped from the schema; nothing reads it once `S3ManagerService` is gone | Assumption, low risk, reversible in a follow-up migration if wrong |
