import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AccountService } from '../../src/account/account.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaAdapterFactory } from '../../src/prisma/prisma.adapter.factory';
import { PRISMA_FACTORY } from '../../src/prisma/prisma.const';
import { PrismaAdapterMockFactory } from '../utils/mock-services/prisma.adapter.factory';
import { TestDatabase } from '../utils/TestDatabase/TestDatabase';
import { cacheHitPrismaFactory } from '../utils/e2e-services/cache-hit-prisma';

// A cache hit used to return `lastLoginAt` as an ISO string, so a service calling `.getTime()` on it failed only
// when the read happened to be cached. Every read must hand services the same types on a hit as on a miss.
describe('Reads served from the Redis cache (e2e)', () => {
  const testDatabase = new TestDatabase();
  let module: TestingModule;

  beforeAll(async () => {
    await testDatabase.beforeAll();
  });

  beforeEach(async () => {
    await testDatabase.beforeEach();
    const adapterFactory = new PrismaAdapterMockFactory(
      testDatabase.getPGlite(),
    );
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaAdapterFactory)
      .useValue(adapterFactory)
      .overrideProvider(PRISMA_FACTORY)
      .useValue(cacheHitPrismaFactory(adapterFactory))
      .compile();
  });

  afterEach(async () => {
    await module.close();
    await testDatabase.afterEach();
  });

  afterAll(async () => {
    await testDatabase.afterAll();
  });

  it('returns a cached account with Date columns as Dates', async () => {
    const lastLoginAt = new Date('2026-10-08T10:00:00.000Z');
    const { id } = await module
      .get(PrismaService)
      .account.create({ data: { lastLoginAt } });

    const account = await module.get(AccountService).getAccountById(id);

    expect(account?.lastLoginAt).toBeInstanceOf(Date);
    expect(account?.lastLoginAt.getTime()).toBe(lastLoginAt.getTime());
    expect(account?.createdAt).toBeInstanceOf(Date);
  });
});
