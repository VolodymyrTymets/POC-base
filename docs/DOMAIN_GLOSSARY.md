# Domain glossary

> One meaning per term. This drives naming in code, database and UI copy.
> A new user-facing noun means a line here, in the same PR (rule E1).

This is a generic starter base (see `BUSINESS_MODEL.md`), so these terms are deliberately generic —
a real POC forked from this repo should extend this table with its own domain, not repurpose these
names for something they don't mean.

| Term (client language) | Code identifier | Means exactly | Not to be confused with |
|------------------------|-----------------|---------------|-------------------------|
| Account | `Account` (Prisma model), `AccountEntity` | The authenticatable identity — id, login timestamps, soft-delete flag. Holds no personal data itself. | `AccountProfile`, which holds the actual person's details |
| Profile | `AccountProfile` | The personal details attached 1:1 to an `Account`: name, phone, email, DOB, SSN, avatar. | `Account` |
| Identity / credentials | `AccountIdentity` | Password/OTP hash material and the refresh token for an `Account`. Never exposed through GraphQL. | `AccountProfile` |
| Role | `AccountRole` (`CUSTOMER`, `ADMIN`), `AccountOnRole` | A named permission bucket an `Account` can be placed in, many-to-many via `AccountOnRole`. | — |
| File | `File`, `FileEntity` | A tracked upload: S3 key, mime type, size, and an upload-lifecycle `status`. | The actual bytes, which live in S3, not the database |
| Notification | `Notification`, `NotificationRecipient` | A message plus the set of accounts it was sent to. `type` is currently a free string (`// todo: move to enum`). | — |
| Sign-in code / OTP | `SignInOtpEntity`, `OtpCodeGeneratorService` | The one-time code sent to a phone number to authenticate; hashed at rest, never logged. | JWT access/refresh tokens, issued after OTP verification |

## Naming rules that follow from the above
- Prisma **relation** fields are PascalCase matching the related model name (`AccountProfile`, `LastAccountRole`); **scalar** fields are camelCase (rule P1).
- "Delete" always means a soft delete (`deleted: Boolean`); there is no hard-delete vocabulary in this codebase (rule P2).
- `Customers`/`customer` appear in two places (`account.service.ts`, `init.customer.migration.ts`) referring to a model that does not exist in the schema — this is a bug, not a domain term; see `ARCHITECTURE.md` known landmines.

## Status/enum vocabularies
| Enum | Values | Meaning of each |
|------|--------|-----------------|
| `AccountRoleType` | `CUSTOMER`, `ADMIN` | Who the account acts as — gates `RoleGuard`/`@Roles(...)` checks. |
| `FileStatus` | `FILE_STATUS_CREATED`, `FILE_STATUS_UPLOAD_IN_PROGRESS`, `FILE_STATUS_UPLOAD_COMPLETED`, `FILE_STATUS_UPLOAD_FAILED` | Where an upload is in its S3 presigned-URL lifecycle. |
| `FileType` | `IMG`, `VIDEO` | Declared in the schema; not yet observed wired to any resolver/service logic — confirm before relying on it. |
