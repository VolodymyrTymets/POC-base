---
name: test-conventions
description: Test design conventions for the api/ NestJS + GraphQL + Prisma service
---

# Test Skill Guide

This guide covers the testing patterns and best practices used in the `api/` project (a NestJS + GraphQL + Prisma service, currently the "POC" instance of this POC base). Use this when writing or modifying tests. See also `.claude/rules/testing.md` and `.claude/rules/testing-js.md` for the rules this guide implements.

## Testing Overview

The project uses **Jest** for unit tests and **e2e tests**, with:
- **PGlite**: In-memory PostgreSQL for fast test execution (no external DB needed)
- **PostGIS**: Available in tests for geospatial queries
- **TestDatabase**: Utility for managing the per-suite test database lifecycle
- **MigratedTemplate**: Builds the migrated and seeded database once and hands every suite a dump of it
- **Supertest**: HTTP testing library for e2e tests
- **Jest Spies**: Mocking external dependencies while keeping real database

## Test File Organization

- **Unit Tests**: `api/src/**/*.spec.ts` (jest config from `api/test/jest.json`)
- **E2E Tests**: `api/test/**/*.e2e-spec.ts` (jest config from `api/test/jest-e2e.json`)
- **Test Utilities**: `api/test/utils/**/*.ts`
    - `TestDatabase`: Manages database lifecycle
    - `e2e-sercices/**/*.ts`: Provides GraphQL client for e2e tests, queries and mutations
    - `mock-services/**/*.ts`: Mocks external services (e.g. AWS S3, Stripe, Twilio)

## TestDatabase Lifecycle

All tests using the database must use `TestDatabase` for proper setup/teardown:

```typescript
import { TestDatabase } from 'test/utils/TestDatabase/TestDatabase';

describe('MyService', () => {
  const testDatabase = new TestDatabase();

  beforeAll(async () => {
    await testDatabase.beforeAll(); // Initializes PGlite from the migrated template
  });

  beforeEach(async () => {
    await testDatabase.beforeEach(); // Optional: runs before each test
  });

  afterAll(async () => {
    await testDatabase.afterAll(); // Cleanup
  });

  // tests...
});
```

**Important**: After each test, you must remove data inserted during the test. This is typically handled automatically or by using database delete operations in `afterEach` hooks.

## The migrated template

`TestDatabase.beforeAll()` does not replay the Prisma migrations. `MigratedTemplate.getDump()` (`api/test/utils/MigratedTemplate/`) builds one PGlite database from `prisma/migrations/**` and then the seed items in `src/migrations/**` (rule P4), dumps it to `os.tmpdir()` as `poc-base-pglite-<hash>.tar`, and every suite loads that dump (about 0.5 s instead of about 3 s).

- The hash covers every file under `prisma/migrations` and `src/migrations`, so a new migration or seed item makes the next run rebuild the template. Old `.tar` files in the temp dir are never deleted automatically and are safe to remove.
- The hash also covers `src/{account,account-profile,account-role,files}` (the seed run executes those services; spec files excluded) and the installed PGlite version.
- The first suite to ask takes an atomic lock directory (`<template>.lock`) and builds; parallel workers wait for the finished file, which is written by rename so it is never partial.
- Isolation is per suite: each suite gets its own database from the dump. Within a suite, clean up what a test inserts.
- `TestDatabase.beforeEach()` turns on jest fake timers (real `setTimeout` and `setImmediate`). Move the clock with `jest.setSystemTime(...)` to expire a token; never sleep.
- e2e apps start with `listenOnLoopback(app)` (`test/utils/e2e-services/listen-on-loopback.ts`) instead of `app.init()`, so supertest never hits a port held by another process on macOS.

## Unit Test Pattern

Use this template for testing services with real database:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { MyService } from './my.service';
import { TestDatabase } from 'test/utils/TestDatabase/TestDatabase';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';

describe('MyService', () => {
  let myService: MyService;
  let prismaService: PrismaService;
  const testDatabase = new TestDatabase();

  beforeAll(async () => {
    await testDatabase.beforeAll();
  });

  beforeEach(async () => {
    await testDatabase.beforeEach();
    const app: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        PrismaModule,
        // Import other required modules
      ],
      providers: [MyService],
    }).compile();

    myService = app.get<MyService>(MyService);
    prismaService = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await testDatabase.afterAll();
  });

  it('should be defined', () => {
    expect(myService).toBeDefined();
  });

  describe('methodName', () => {
    it('should perform expected action', async () => {
      // Arrange
      const input = { /* test data */ };

      // Act
      const result = await myService.methodName(input);

      // Assert
      expect(result).toBeDefined();
      expect(result.property).toBe(expectedValue);

      // Verify database state
      const dbRecord = await prismaService.model.findFirst({
        where: { /* filter */ },
      });
      expect(dbRecord).toBeDefined();
    });

    it('should throw error on invalid input', async () => {
      const invalidInput = { /* invalid data */ };

      await expect(myService.methodName(invalidInput))
        .rejects.toThrow(new UnauthorizedException('Custom error'));
    });
  });
});
```

### Key Patterns for Unit Tests

1. **Use Real Database**: Query PrismaService after service operations to verify database state
2. **Mock External Services**: Use Jest spies for external APIs (notifiers, queues)
3. **Test Error Cases**: Include tests for exceptions and edge cases
4. **Clear Assertions**: Each test should verify one behavior clearly
5. **Test Data**: Use realistic test data (e.g., valid phone numbers `+1234567890`)

## Mocking Pattern

Mock external services while keeping real database:

```typescript
import { NotifierService } from '../notifier/notifier.service';

beforeEach(async () => {
  // ... TestingModule setup ...
  notifierService = app.get<NotifierService>(NotifierService);
});

it('should call notifier', async () => {
  const notifySpy = jest
    .spyOn(notifierService, 'notifyAboutTOTPCode')
    .mockResolvedValue(undefined);

  await myService.methodName({ /* args */ });

  expect(notifySpy).toHaveBeenCalled();
  expect(notifySpy).toHaveBeenCalledWith(expectedArg);
});
```

## E2E Test Pattern

Use this template for testing full HTTP requests with AppModule:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { TestDatabase } from '../utils/TestDatabase/TestDatabase';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Feature (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: PrismaService;
  const testDatabase = new TestDatabase();

  beforeAll(async () => {
    await testDatabase.beforeAll();
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prismaService = await moduleFixture.resolve(PrismaService);
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await testDatabase.afterAll();
  });

  it('should complete full user flow', async () => {
    // Make GraphQL request
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          signInOtp(signInInput: {
            phoneNumber: "+12125551234"
          })
        }`,
      })
      .expect(200);

    expect(response.body.data.signInOtp).toBeDefined();

    // Verify database state
    const account = await prismaService.account.findFirst({
      where: { AccountProfile: { phoneNumber: '+12125551234' } },
    });
    expect(account).toBeDefined();
  });

  it('should return validation error for invalid input', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          signInOtp(signInInput: {
            phoneNumber: "invalid"
          })
        }`,
      })
      .expect(200);

    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].extensions?.originalError?.message).toMatch(/phone/i);
  });
  
});
```

### Key Patterns for E2E Tests

1. **Use Full AppModule**: Tests the entire application stack
2. **Test GraphQL Queries/Mutations**: Use supertest with `.post('/graphql')`
3. **Verify Database State**: Query PrismaService to confirm side effects
4. **Test Error Cases**: Check response.body.errors structure
5. **Test Authentication**: Include `Authorization` header in requests
6. **Clean Headers**: Add headers like `'Authorization': 'Bearer token'` with `.set()`

## Common Assertions

### Database Assertions
```typescript
// Verify record exists
const record = await prismaService.model.findFirst({ where: { /* ... */ } });
expect(record).toBeDefined();

// Verify count
const count = await prismaService.model.count({ where: { /* ... */ } });
expect(count).toBe(1);

// Verify specific field
expect(record.field).toBe(expectedValue);
expect(record.field).toBeNull();
expect(record.field).toBeDefined();
```

### GraphQL Response Assertions
```typescript
// Check successful response
expect(response.body.data).toBeDefined();
expect(response.body.errors).toBeUndefined();

// Check mutation result
expect(response.body.data.mutationName).toBeDefined();
expect(response.body.data.mutationName.property).toEqual(value);

// Check errors
expect(response.body.errors).toBeDefined();
expect(response.body.errors[0].message).toMatch(/pattern/i);

// Check nested fields
expect(response.body.data.account.AccountProfile.phoneNumber).toEqual(phoneNumber);
```

### Time-based Assertions
```typescript
const beforeTime = Date.now();
await myService.methodName();
const afterTime = Date.now();

const dbTimestamp = record.createdAt.getTime();
expect(dbTimestamp).toBeGreaterThanOrEqual(beforeTime);
expect(dbTimestamp).toBeLessThanOrEqual(afterTime + 100); // 100ms buffer
```

## Running Tests

The declared `pnpm --dir api run test` / `test:e2e` scripts invoke `node node_modules/.bin/jest` directly,
which breaks under pnpm's POSIX-shell `.bin` shims (see root `docs/RUNBOOK.md`). Use these instead, from the repo root:

```bash
# Run all unit tests
NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config ./test/jest.json

# Run a specific test file
NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config ./test/jest.json src/auth/auth.service.spec.ts

# Run tests matching a name pattern
NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config ./test/jest.json --testNamePattern="should authenticate"

# Run e2e tests
NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config ./test/jest-e2e.json

# Run with coverage
NODE_OPTIONS=--experimental-vm-modules pnpm --dir api exec jest --config ./test/jest.json --coverage
```

## Best Practices

1. **One behavior per test**: Each `it()` block tests one specific behavior
2. **Clear test names**: Use descriptive names that explain what's being tested
3. **Arrange-Act-Assert**: Organize tests into setup, execution, verification
4. **Use real data**: Create realistic test data (valid phone numbers, IDs, etc.)
5. **Test both happy paths and errors**: Include success and failure scenarios
6. **Avoid test interdependencies**: Each test should be independent and idempotent
7. **Cleanup after tests**: Remove inserted data or use transactions/rollback
8. **Mock boundaries only**: Mock external services (APIs, queues), not internal logic
9. **Verify side effects**: Check database state changes, not just return values
10. **Clear error messages**: Use meaningful assertion messages

## Example: Complete OTP Auth Test

See `api/src/auth/services/otp-auth-strategy/otp-auth-strategy.service.spec.ts` for a complete example covering:
- Account creation and OTP generation
- OTP verification with token generation
- Error handling (expired codes, invalid codes, missing accounts)
- Database state verification
- Service method mocking

## Troubleshooting

**PGlite errors in tests**: Ensure `.env.test` sets `DATABASE_DIR=/tmp/pglite`

**"Cannot find module" errors**: Check TestingModule imports include all required modules

**Database state bleeding between tests**: Ensure TestDatabase.beforeEach() is called or data is cleaned up

**GraphQL schema not found**: Some e2e tests need the full app initialization - use `AppModule` not individual modules

**Timeout errors**: The first run after a migration or seed change rebuilds the template (a few seconds, once). A repeated `Exceeded timeout ... for a hook` in `beforeAll` usually means too many parallel workers for the machine; `jest-e2e.json` sets `maxWorkers` to 2 (lower it to 1 first).

**Hook timeouts or `Timed out waiting for the PGlite template` right after a killed run**: the killed run left `<tmpdir>/poc-base-pglite-<hash>.tar.lock` behind. A lock older than 20 s is taken over automatically, so rerun after that; or delete the lock directory yourself.

**`SyntaxError` from `node_modules/.bin/jest`**: You are running the declared `test`/`test:e2e` npm script under pnpm. Use the `pnpm exec jest` invocations above instead (see root `docs/RUNBOOK.md`).