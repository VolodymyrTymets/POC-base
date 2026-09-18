# ADR-0010 — PostgreSQL replaces S3 for file storage

- **Date:** 2026-09-18
- **Status:** accepted
- **Deciders:** volodymyr (plan approval and mid-plan checkpoints, KAN-6)
- **Ticket:** KAN-6

## Context
`File` bytes lived in S3, reached through a presigned-URL dance: `createFile` returned an `uploadUrl`
(`S3ManagerService.getSignedUrl`) the client PUT to directly, and `FileEntity.publicUrl` returned a
presigned GET URL (`S3ManagerService.getPublicUrl`). KAN-6 asked to remove S3 entirely and make
PostgreSQL — already the single source of truth for every other domain table (`ARCHITECTURE.md`) — the
source of truth for file bytes too, so a POC forked from this base doesn't need an S3 bucket and AWS
credentials provisioned before the `File` flow works.

This directly conflicted with `docs/BUSINESS_MODEL.md`'s non-negotiable that a real S3 bucket must stay
wired up. Resolved as a plan-approval, human decision (2026-09-18): supersede that non-negotiable rather
than block the ticket or find an in-scope way to keep S3 real. `docs/BUSINESS_MODEL.md` was updated in the
same PR to record the supersession — the SMS non-negotiable is untouched.

Removing the presigned-URL flow also removed the *mechanism* for getting bytes into and out of Postgres —
this repo is GraphQL-only (ADR-0002, no REST contract), and adding a runtime dependency needs explicit
approval (rule C2). Two upload and two download options were weighed at plan approval (human decision):

## Decision
1. **Upload:** `createFile`/`updateFile` accept an optional `content: String` (base64) field, validated
   with `class-validator`'s `@IsBase64()`, decoded to a `Buffer` and stored in a new `File.content Bytes?`
   column. `FileAssertService` checks the decoded byte length against `FILE_MAX_SIZE`, independently of the
   existing client-reported `size` check.
2. **Download:** `FileEntity.publicUrl` is computed from the stored bytes as a
   `data:<mimeType>;base64,<content>` URI, instead of resolving to a presigned S3 GET URL.
3. `File.key` (the S3 object key) is dropped from the schema — nothing reads it once `S3ManagerService` is
   gone. `S3ManagerService`, `IS3ManagerService`, and the `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
   `aws-sdk`, `aws-sdk-v3-nest` dependencies are deleted outright, not feature-flagged.
4. `createFile` returns `FileEntity` directly instead of the `CreateFileEntity { file, uploadUrl }`
   wrapper, which is deleted — `uploadUrl` has no meaning without a presigned URL, and a one-field wrapper
   has no remaining purpose once it's gone. This matches `updateFile`'s and `file`'s return shape already.
   This is a breaking GraphQL contract change; confirmed zero consumers in `web/` today (grepped for
   `createFile`/`FileEntity`/`uploadUrl`, no hits — `web/` has placeholder routes only, `ARCHITECTURE.md`).

## Rejected / deferred alternatives
| Alternative | Why not (for this ticket) |
|-------------|---------------------------|
| REST multipart upload endpoint (`@nestjs/platform-express`'s built-in support) | Would be the first real REST route in this GraphQL-first API (`ARCHITECTURE.md`) — a bigger boundary decision than this ticket's scope; deferred as a human decision at plan approval, not silently ruled out. |
| REST streaming download endpoint | Same boundary trade-off as above; base64-in-GraphQL was chosen for both directions for symmetry. |
| `graphql-upload` (GraphQL multipart request spec) | Would add a new runtime dependency without a clear win over base64 for this repo's file sizes (rule C2 — not approved). |

## Consequences
- Positive: a POC forked from this base after KAN-6 needs no S3 bucket or AWS credentials for the `File`
  flow to work end to end — one fewer piece of infrastructure to provision (`BUSINESS_MODEL.md` goal 1).
- Accepted cost: base64 encoding adds ~33% overhead over raw bytes, both in the mutation payload and in
  `publicUrl`'s response. Acceptable at the existing 10MB `FILE_MAX_SIZE` default for a POC base; not
  acceptable at arbitrary scale.
- Accepted cost: the entire file is buffered in memory on both the write path (`Buffer.from(...)`) and the
  read path (building the `data:` URI) — no streaming. Fine at POC file sizes; a real constraint if this
  base is ever asked to handle large uploads.
- `docs/BUSINESS_MODEL.md`'s S3 non-negotiable is superseded, not narrowed — a POC forked from this base no
  longer proves a real S3 integration path. If a future client engagement needs real object storage, that
  is a decision for that fork.
- The `FileType` enum's `VIDEO` value (declared in the schema, not yet wired to any resolver/service logic
  per `DOMAIN_GLOSSARY.md`) would hit both accepted costs above hardest if it's ever wired up — flagged
  under "Revisit when" below, not solved here.

## Revisit when
`FileType.VIDEO` (or any file type meaningfully larger than the 10MB default) gets wired to real logic —
at that point, the deferred REST-streaming alternative above should be reconsidered, since base64-in-GraphQL
was accepted specifically for small POC-sized files, not as a permanent architectural choice.
