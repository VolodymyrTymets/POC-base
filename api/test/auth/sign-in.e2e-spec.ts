import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { DataCooker } from '../utils/DataCooker/DataCooker';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { GraphQLResponseType } from '../utils/e2e-services/interfaces/types';
import { SignInService } from '../utils/e2e-services/sign-in.service';
import { PrismaAdapterMockFactory } from '../utils/mock-services/prisma.adapter.factory';
import { PrismaAdapterFactory } from '../../src/prisma/prisma.adapter.factory';
import { INVALID_CREDENTIALS } from '../../src/common/errors';

type TokensResponse<Key extends string> = GraphQLResponseType<
  Record<Key, { accessToken: string; refreshToken: string }>
>;

describe('Sign in with password (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: PrismaService;
  let signInService: SignInService;

  const dataCooker = new DataCooker();
  const password = 'correct horse';

  const graphql = async <T>(query: string, variables: object) =>
    (await request(app.getHttpServer())
      .post('/graphql')
      .send({ query, variables })
      .expect(200)) as T;

  const signUp = (email: string) =>
    graphql<TokensResponse<'signUp'>>(
      `mutation($input: SignUpInput!) {
        signUp(signUpInput: $input) { accessToken refreshToken }
      }`,
      { input: { email, password } },
    );

  const signIn = (email: string, pass: string) =>
    graphql<TokensResponse<'signIn'>>(
      `mutation($input: PasswordSignInInput!) {
        signIn(signInInput: $input) { accessToken refreshToken }
      }`,
      { input: { email, password: pass } },
    );

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
    signInService = new SignInService(app);
  });

  it('Should sign in with the right password and reach an authenticated query', async () => {
    const email = 'signin.ok@example.com';
    await signUp(email);

    const response = await signIn('SignIn.OK@Example.com', password);

    expect(response.body.errors).toBeUndefined();
    const { accessToken } = response.body.data.signIn;
    const account = await signInService.getAccount(accessToken);
    const stored = await prismaService.accountProfile.findFirstOrThrow({
      where: { email },
    });
    expect(account.id).toEqual(stored.accountId);
  });

  it('Should return UNAUTHENTICATED for a wrong password', async () => {
    await signUp('signin.wrong@example.com');

    const response = await signIn('signin.wrong@example.com', 'wrong password');

    expect(response.body.errors?.[0].extensions.code).toEqual(
      'UNAUTHENTICATED',
    );
    expect(response.body.errors?.[0].message).toEqual(INVALID_CREDENTIALS);
  });

  it('Should answer an unknown email exactly like a wrong password', async () => {
    await signUp('signin.same@example.com');

    const wrongPassword = await signIn('signin.same@example.com', 'nope nope');
    const unknownEmail = await signIn('nobody@example.com', 'nope nope');

    expect(unknownEmail.body.errors?.[0].message).toEqual(
      wrongPassword.body.errors?.[0].message,
    );
    expect(unknownEmail.body.errors?.[0].extensions.code).toEqual(
      wrongPassword.body.errors?.[0].extensions.code,
    );
  });

  it('Should not let an OTP-only account sign in with a password', async () => {
    const phoneNumber = '+12125550188';
    const { accessToken } = await signInService.signInOtp(phoneNumber);
    const otpAccount = await signInService.getAccount(accessToken);
    await prismaService.accountProfile.update({
      where: { accountId: otpAccount.id },
      data: { email: 'otp.only.e2e@example.com' },
    });

    const response = await signIn('otp.only.e2e@example.com', password);

    expect(response.body.errors?.[0].extensions.code).toEqual(
      'UNAUTHENTICATED',
    );
    expect(response.body.errors?.[0].message).toEqual(INVALID_CREDENTIALS);
  });

  it('Should return a validation error for a malformed email', async () => {
    const response = await signIn('not-an-email', password);

    const messages = [
      response.body.errors?.[0].extensions.originalError.message,
    ].flat();
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/email/i)]),
    );
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });
});
