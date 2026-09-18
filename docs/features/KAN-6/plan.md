# KAN-6 — implementation plan

<!-- A human writes this line to approve. Until it is here, guard-plan-approval blocks writes to code.
     A deliberate exception is written the same way, with its reason:
     Approved-by: spike, no review — KAN-6 -->
Approved-by: volodymyr · 2026-09-18

Pattern followed: `api/src/files/**` itself is the precedent — same feature module, same layering
(resolver → service → `PrismaService`), same DTO/assert-service split (rule P3). No prior ADR swaps a
*storage backend* specifically; `docs/decisions/ADR-0007-oxlint-linter.md` and
`ADR-0006-pnpm-dependency-manager.md` are the same shape of decision (swap a core piece, write an ADR) and
set the precedent this plan follows for R9.

Prerequisite already applied (plan-approval round, human decision — see spec.md "Constitution change"):
`docs/BUSINESS_MODEL.md`'s S3 non-negotiable is superseded, not this plan's job to redo.

## Contract changes
- **GraphQL (breaking):** `createFile` returns `FileEntity` directly (was `CreateFileEntity { file,
  uploadUrl }`) — `uploadUrl` has no meaning once there's no presigned URL. `CreateFileEntity` is deleted.
  `CreateFileInput`/`UpdateFileInput` gain an optional `content: String` (base64) field. `FileEntity.publicUrl`
  changes meaning: was a presigned S3 GET URL (expires), now a `data:` URI (does not expire, scales with
  file size). No known external consumer today (`web/` has no screens using `File` yet — confirmed by
  grepping `web/` for `createFile`/`FileEntity`/`uploadUrl`, zero hits) — low blast radius.
- **data:** `api/prisma/models/files.prisma` — add `content Bytes?`, drop `key String?`. Forward migration
  via `pnpm --dir api run prisma-migrate` (local only, rule C5); rollback is a second migration re-adding
  `key` and dropping `content` if ever needed — no backfill either direction since no production data exists
  (`ARCHITECTURE.md`: no staging/prod environment defined in this repo).
- **generated output:** `api/schema.gql` regenerates on next boot (S3/D3); `api/generated/prisma/**`
  regenerates via `pnpm --dir api run prisma-gen` after the schema edit.

## Requirements (ordered, each independently verifiable)

### R1 — Prisma schema: add `content`, drop `key` (S)
- files: `api/prisma/models/files.prisma` (change), new migration under `api/prisma/migrations/`
  (generated, not hand-written)
- layer: data
- test: none directly — proven by R4/R10 compiling and running against the new column
- executed how: `pnpm --dir api run prisma-gen` then `pnpm --dir api run prisma-migrate` against the local
  dev DB; inspect the generated `migration.sql` to confirm it's `ADD COLUMN content BYTEA` +
  `DROP COLUMN key`, nothing else. **Before building R2–R8 on top of this**, this schema has no prior
  `Bytes` column anywhere (grepped `api/prisma/models/*.prisma`) and every test runs against PGlite
  (in-memory Postgres, not real Postgres) — do one smoke check first: via `DataCooker`/PGlite, create a
  `File` row with a non-trivial `content` `Buffer`, read it back, and assert byte-for-byte equality. If
  PGlite mishandles `BYTEA`, that has to surface here, not after six more requirements assume it works.
- risk: PGlite could have a `Bytes`/`BYTEA` gap since nothing in this repo has exercised it yet — the smoke
  check above is the cheap way to find out before the rest of the plan depends on it

### R2 — DTOs: add `content` to `CreateFileInput` (S)
- files: `api/src/files/dto/create-file.input.ts` (change — `content?: string` with `@IsBase64()
  @IsOptional()`, no `@MaxLength` here: a static decorator can't read the runtime `FILE_MAX_SIZE` config
  value, and a hardcoded DTO cap would drift from R3's dynamic check — size is enforced solely by R3's
  decoded-byte-length comparison against `FILE_MAX_SIZE`); `UpdateFileInput` needs no direct edit, it
  already extends `CreateFileInput` (rule D3 — no escape hatch, real validation at the boundary, not a
  bare `string`)
- layer: boundary (DTO)
- test: unit test on the DTO's validation (reject non-base64, accept valid base64) — new, alongside
  existing `FileAssertService` unit coverage
- executed how: `NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config ./test/jest.json`
- risk: none

### R3 — `FileAssertService`: validate decoded content size (S)
- files: `api/src/files/services/file-assert.service.ts` (change — `assertFileInput` decodes `content`
  when present and checks `Buffer.byteLength(content, 'base64')` against `max_size`, alongside the
  existing client-reported `size` check, which stays as-is)
- layer: service (business rule)
- test: `api/src/files/services/file-assert.service.spec.ts` (new or extended, if one doesn't already
  exist — confirm during implementation) — oversized decoded content is rejected same as oversized `size`
- executed how: unit test run
- risk: a client could lie about `size` while `content` is small (or vice versa) — both checks apply
  independently, so the smaller of the two limits is what actually gates, which is the safe direction

### R4 — `FilesService`: drop `S3ManagerService`, persist bytes (M)
- files: `api/src/files/files.service.ts` (change — remove the `S3ManagerService` constructor param and
  the `getSignedUrl`/`generateKey` calls; `createFile` stores `Buffer.from(input.content, 'base64')` into
  `content` when provided; returns the `File` record directly, no `uploadUrl`; `updateFile` passes `content`
  through the same way when present in its input). **Amended (second self-review round):** the `status`
  field this R4 originally set is gone entirely, not just derived from content — see ADR-0010's amendment.
- layer: service
- test: `api/src/files/files.service.spec.ts` (new, following the `DataCooker` pattern — rule P5, no
  mocked Prisma) — covers both the with-content and without-content `createFile` paths
- executed how: unit test run
- risk: none — no more external call in this path, strictly simpler than today

### R5 — `FilesResolver` + entities: drop `CreateFileEntity`, `publicUrl` builds a data URI (M)
- files: `api/src/files/files.resolver.ts` (change — remove `S3ManagerService` dependency; `createFile`
  returns `Promise<FileEntity>`; `publicUrl` field resolver becomes synchronous, returns
  `` `data:${file.mimeType};base64,${file.content.toString('base64')}` `` or `null` when `file.content` is
  null/`mimeType` is null), `api/src/files/entities/file.entity.ts` (add `content?: Buffer | null` as a
  plain, non-`@Field` property — same pattern `key` used, never exposed raw to GraphQL, rule D6),
  `api/src/files/entities/create-file.entity.ts` (deleted — intentionally, not incidentally: once
  `uploadUrl` is gone it is a one-field wrapper (`{ file: FileEntity }`) with no remaining purpose, so
  `createFile` returns `FileEntity` directly, matching `updateFile`'s and `file`'s return shape already)
- layer: transport (resolver) + entity mapping
- test: covered by the e2e spec (R8) — a resolver-level unit test would duplicate that per testing rule 2
- executed how: proven by R8/R10's real GraphQL calls
- risk: `publicUrl`'s `data:` URI grows with file size (~33% base64 overhead) — acceptable at the existing
  10MB `FILE_MAX_SIZE` default for a POC base; flagged as a documented trade-off in the ADR (R9), not a
  defect

### R6 — `FilesModule`: remove S3/AWS wiring (S)
- files: `api/src/files/files.module.ts` (change — remove `AwsSdkModule.registerAsync(...)`, `S3Client`
  import, `S3ManagerService` provider)
- layer: module wiring
- test: none directly — module fails to compile/boot if this is wrong, caught by R10
- executed how: `pnpm --dir api exec tsc --noEmit`
- risk: none

### R7 — Delete `S3ManagerService`/interface, remove AWS deps (S)
- files: `api/src/files/services/s3-manager.service.ts` (deleted), `api/src/files/services/
  s3-manager.interface.ts` (deleted), `api/package.json` (`dependencies`: remove `@aws-sdk/client-s3`,
  `@aws-sdk/s3-request-presigner`, `aws-sdk`, `aws-sdk-v3-nest` — confirmed nothing else in `api/src`
  imports any of them, grepped repo-wide)
- layer: dependency management
- test: none directly
- executed how: `pnpm --dir api remove @aws-sdk/client-s3 @aws-sdk/s3-request-presigner aws-sdk
  aws-sdk-v3-nest` — pnpm owns lockfile regeneration (rule T3); confirmed no `AWS_*` env vars exist in
  `api/.env.example`/`api/.env.develoment.example`/`api/.env.test`/`docker-compose.yml` to clean up
- risk: none — verified no other consumer first

### R8 — Update tests: delete S3 mock, rewrite the e2e spec for the new contract (M)
- files: `api/test/utils/mock-services/s3-manager.service.ts` (deleted), `api/test/file/upload-file.e2e
  -spec.ts` (rewrite: no `S3ManagerService` override; `createFileMutation`/response shape drop
  `uploadUrl`; add a case that sends `content` and asserts `publicUrl` is a `data:` URI containing the
  right mime type; keep the ownership/forbidden-access cases as-is since `FileAssertService` logic is
  unchanged there), `api/test/utils/e2e-services/file-e2e.service.ts` (change — `createFileMutation`'s
  GraphQL query and `CreateFileResponse` type drop `uploadUrl`, optionally accept `content`)
- layer: test
- test: this *is* the test
- executed how: `NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config
  ./test/jest-e2e.json` — capture real pass output as evidence (rule B1/B5)
- risk: the suite currently fails to boot at all (documented Customer-model bug, `ARCHITECTURE.md` known
  landmines) — this is pre-existing and out of scope (rule B4); evidence will note it explicitly rather
  than silently working around it

### R9 — Docs: ADR, ARCHITECTURE.md, DOMAIN_GLOSSARY.md (S)
- files: `docs/decisions/ADR-0010-postgres-file-storage.md` (new — records the decision, the two
  rejected/deferred alternatives from plan approval — REST multipart upload, REST streaming download —
  and the base64-overhead trade-off from R5); `docs/ARCHITECTURE.md` (remove the "AWS S3" row from
  External integrations; rewrite Key flow #3 "File upload" — no more presigned URL / direct-to-S3 step);
  `docs/DOMAIN_GLOSSARY.md` (the `File` row's "Not to be confused with" column currently says bytes live
  in S3 "not the database" — now they do; reword)
- layer: docs
- test: none (docs)
- executed how: re-read each file after editing to confirm no stale S3 reference remains outside
  historical/comparison context
- risk: none

### R10 — Verify (S)
- files: none
- layer: n/a
- test: `pnpm --dir api exec tsc --noEmit`, `pnpm --dir api run lint`, both jest configs (unit + e2e), and
  a real `createFile`/`updateFile`/`file` GraphQL round-trip against a running `pnpm --dir api run
  start:dev` (per the session's port note, run with `PORT=2000` to avoid colliding with any other stack on
  the default 3001)
- executed how: run each command, paste real output; capture the actual GraphQL request/response for the
  evidence block (rule B1/B5) — this is what proves the feature, not the unit tests alone
- risk: the pre-existing Customer-model boot crash (`ARCHITECTURE.md`) may block `start:dev` entirely —
  if so, report it as a pre-existing blocker for *manual* verification specifically, not silently skip it

## Docs to update in this PR
- [ ] `docs/features/KAN-6/spec.md` (acceptance criteria checked off)
- [ ] `docs/BUSINESS_MODEL.md` (already applied, pre-plan)
- [ ] `docs/decisions/ADR-0010-postgres-file-storage.md` (new, R9)
- [ ] `docs/ARCHITECTURE.md` (R9)
- [ ] `docs/DOMAIN_GLOSSARY.md` (R9)

## Risks
| Risk | Impact | Cheapest way to find out early |
|------|--------|-------------------------------|
| Pre-existing Customer-model bug crashes app boot / `DataCooker` (`ARCHITECTURE.md`) | Can't run `start:dev` or e2e suites to completion, blocking R8/R10's real verification | Confirmed present at plan time by re-reading `ARCHITECTURE.md`; not this ticket's to fix (rule B4) — report as a pre-existing blocker in the PR evidence, not a KAN-6 regression |
| `data:` URI approach doesn't scale to `VIDEO`-type files if that `FileType` ever gets wired up | A future large-file use case would need the REST-streaming alternative that was deferred here | Documented explicitly in the ADR's "Revisit when" section (R9) |
| Breaking the `createFile` GraphQL contract (`uploadUrl` removed, return type changed) | Any consumer relying on the old shape breaks | Confirmed zero `web/` consumers today (grep, see Contract changes); called out in the PR body regardless |

## Assumptions
- "s3 service removed from app" (ticket AC) means the `S3ManagerService`/AWS SDK dependency tree, not
  merely made optional or feature-flagged (rule D3 — no escape hatches).
- `key` (the S3 object key column) is dropped, not repurposed — nothing reads it once `S3ManagerService`
  is gone (spec OQ3).
- ~~The `FileStatus` upload-lifecycle enum and its guard logic (`FileAssertService`) are unchanged...~~
  **Amended (second self-review round):** `FileStatus` is removed entirely, not left unchanged — see
  ADR-0010's amendment. The original assumption didn't anticipate that the first self-review round's own
  fix (status derived from content presence) would make the field itself redundant.
- Base64-in-GraphQL for upload and a `data:` URI for download, per the human decision at plan approval —
  not a REST endpoint, not `graphql-upload` (would add a runtime dependency, rule C2, not approved).
