import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { DataCooker } from '../utils/DataCooker/DataCooker';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { GraphQLResponseType } from '../utils/e2e-services/interfaces/types';
import { AccountRoleType } from '../../generated/prisma/enums';
import { PrismaAdapterMockFactory } from '../utils/mock-services/prisma.adapter.factory';
import { PrismaAdapterFactory } from '../../src/prisma/prisma.adapter.factory';
import { EMAIL_ALREADY_REGISTERED } from '../../src/common/errors';

type SignUpResponse = GraphQLResponseType<{
  signUp: { accessToken: string; refreshToken: string };
}>;

describe('Sign up with password (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: PrismaService;

  const dataCooker = new DataCooker();

  const signUp = async (email: string, password: string) =>
    (await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation SignUp($input: SignUpInput!) {
          signUp(signUpInput: $input) { accessToken refreshToken }
        }`,
        variables: { input: { email, password } },
      })
      .expect(200)) as SignUpResponse;

  // class-validator reports an array of messages; the shared response type
  // models a single string, and flat() accepts both without a cast.
  const validationMessages = (response: SignUpResponse) =>
    [response.body.errors?.[0].extensions.originalError.message].flat();

  beforeAll(async () => {
    await dataCooker.beforeAll();
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaAdapterFactory)
      .useValue(new PrismaAdapterMockFactory(dataCooker.getPgLitle()))
      .compile();
    prismaService = await moduleFixture.resolve(PrismaService);
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  it('Should sign up, store a hashed password and return usable tokens', async () => {
    const response = await signUp('Sign.Up@Example.com', 'correct horse');

    expect(response.body.errors).toBeUndefined();
    const { accessToken, refreshToken } = response.body.data.signUp;
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();

    const accountResponse = (await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: `query { account { id AccountProfile { email isPhoneVerified } } }`,
      })
      .expect(200)) as GraphQLResponseType<{
      account: {
        id: string;
        AccountProfile: { email: string; isPhoneVerified: boolean };
      };
    }>;
    const account = accountResponse.body.data.account;
    expect(account.AccountProfile.email).toEqual('sign.up@example.com');
    expect(account.AccountProfile.isPhoneVerified).toEqual(false);

    const identity = await prismaService.accountIdentity.findFirstOrThrow({
      where: { accountId: account.id },
    });
    expect(identity.hash).toBeTruthy();
    expect(identity.hash).not.toEqual('correct horse');

    const roles = await prismaService.accountRole.findMany({
      where: { AccountOnRole: { some: { accountId: account.id } } },
      select: { type: true },
    });
    expect(roles.map((role) => role.type)).toEqual([AccountRoleType.CUSTOMER]);
  });

  it('Should reject an email that is already registered, ignoring case', async () => {
    await signUp('dupe@example.com', 'correct horse');

    const response = await signUp('DUPE@example.com', 'another password');

    expect(response.body.errors).toBeDefined();
    expect(response.body.errors?.[0].message).toEqual(EMAIL_ALREADY_REGISTERED);
    expect(
      await prismaService.accountProfile.count({
        where: { email: 'dupe@example.com' },
      }),
    ).toEqual(1);
  });

  it('Should return a validation error for an invalid email', async () => {
    const response = await signUp('not-an-email', 'correct horse');

    const messages = validationMessages(response);
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/email/i)]),
    );
  });

  it('Should return a validation error for a password shorter than 8 bytes', async () => {
    const response = await signUp('short@example.com', '1234567');

    const messages = validationMessages(response);
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/password/i)]),
    );
  });

  it('Should return a validation error for a password over 72 bytes', async () => {
    // 37 two-byte characters = 74 bytes but only 37 characters, which a
    // character-based length check would let through.
    const response = await signUp('long@example.com', 'é'.repeat(37));

    const messages = validationMessages(response);
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/password/i)]),
    );
    expect(
      await prismaService.accountProfile.count({
        where: { email: 'long@example.com' },
      }),
    ).toEqual(0);
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });
});
