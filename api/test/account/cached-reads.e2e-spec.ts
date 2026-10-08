import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { AccountService } from '../../src/account/account.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaAdapterFactory } from '../../src/prisma/prisma.adapter.factory';
import { PRISMA_FACTORY } from '../../src/prisma/prisma.const';
import { PrismaAdapterMockFactory } from '../utils/mock-services/prisma.adapter.factory';
import { TestDatabase } from '../utils/TestDatabase/TestDatabase';
import { listenOnLoopback } from '../utils/e2e-services/listen-on-loopback';
import { SignInService } from '../utils/e2e-services/sign-in.service';
import type { GraphQLResponseType } from '../utils/e2e-services/interfaces/types';
import { cacheHitPrismaFactory } from '../utils/e2e-services/cache-hit-prisma';

// A cache hit used to return `lastLoginAt` as an ISO string, so a service calling `.getTime()` on it failed only
// when the read happened to be cached. Every read must hand services the same types on a hit as on a miss.
describe('Reads served from the Redis cache (e2e)', () => {
  const testDatabase = new TestDatabase();
  let module: TestingModule;
  let app: INestApplication<App>;

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
    app = module.createNestApplication();
    await listenOnLoopback(app);
  });

  afterEach(async () => {
    await app.close();
    await testDatabase.afterEach();
  });

  afterAll(async () => {
    await testDatabase.afterAll();
  });

  it('hands the service Date columns as Dates on a cache hit', async () => {
    const lastLoginAt = new Date('2026-10-08T10:00:00.000Z');
    const { id } = await module
      .get(PrismaService)
      .account.create({ data: { lastLoginAt } });

    const account = await module.get(AccountService).getAccountById(id);

    expect(account?.lastLoginAt).toBeInstanceOf(Date);
    expect(account?.lastLoginAt.getTime()).toBe(lastLoginAt.getTime());
    expect(account?.createdAt).toBeInstanceOf(Date);
  });

  it('serves the account query end to end on a cache hit', async () => {
    const { accessToken } = await new SignInService(app).signInOtp(
      '+12125551231',
    );

    const response = (await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ query: 'query { account { id createdAt } }' })
      .expect(200)) as GraphQLResponseType<{
      account: { id: string; createdAt: string };
    }>;

    expect(response.body.errors).toBeUndefined();
    expect(
      new Date(response.body.data.account.createdAt).getTime(),
    ).not.toBeNaN();
  });
});
