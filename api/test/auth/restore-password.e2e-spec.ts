import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { DataCooker } from '../utils/DataCooker/DataCooker';
import { PrismaService } from '../../src/prisma/prisma.service';
import { NotifierService } from '../../src/notifier/notifier.service';
import { NotifierTypes } from '../../src/notifier/notifier.service.interface';
import type { GraphQLResponseType } from '../utils/e2e-services/interfaces/types';
import { PrismaAdapterMockFactory } from '../utils/mock-services/prisma.adapter.factory';
import { PrismaAdapterFactory } from '../../src/prisma/prisma.adapter.factory';
import { INVALID_RESET_TOKEN } from '../../src/common/errors';

type Tokens = { accessToken: string; refreshToken: string };
type RestoreResponse = GraphQLResponseType<{
  restorePassword: { success: boolean; token: string | null };
}>;
type ResetResponse = GraphQLResponseType<{ resetPassword: boolean }>;

describe('Restore password (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: PrismaService;
  let notifySpy: jest.SpyInstance;

  const dataCooker = new DataCooker();
  const password = 'correct horse';
  const newPassword = 'battery staple';

  const graphql = async <T>(query: string, variables: object) =>
    (await request(app.getHttpServer())
      .post('/graphql')
      .send({ query, variables })
      .expect(200)) as T;

  const signUp = (email: string) =>
    graphql<GraphQLResponseType<{ signUp: Tokens }>>(
      `mutation($input: SignUpInput!) {
        signUp(signUpInput: $input) { accessToken refreshToken }
      }`,
      { input: { email, password } },
    );

  const signIn = (email: string, pass: string) =>
    graphql<GraphQLResponseType<{ signIn: Tokens }>>(
      `mutation($input: PasswordSignInInput!) {
        signIn(signInInput: $input) { accessToken refreshToken }
      }`,
      { input: { email, password: pass } },
    );

  const restore = (email: string) =>
    graphql<RestoreResponse>(
      `mutation($input: RestorePasswordInput!) {
        restorePassword(restorePasswordInput: $input) { success token }
      }`,
      { input: { email } },
    );

  const reset = (token: string, pass: string) =>
    graphql<ResetResponse>(
      `mutation($input: ResetPasswordInput!) {
        resetPassword(resetPasswordInput: $input)
      }`,
      { input: { token, newPassword: pass } },
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
    // call-through spy: the real notifier and queue still run
    notifySpy = jest.spyOn(
      moduleFixture.get(NotifierService),
      'notifyAboutPasswordReset',
    );
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  it('Should restore then reset: the new password works and the old one does not', async () => {
    const email = 'restore.ok@example.com';
    await signUp(email);

    const restored = await restore(email);

    expect(restored.body.errors).toBeUndefined();
    expect(restored.body.data.restorePassword.success).toEqual(true);
    const token = restored.body.data.restorePassword.token;
    expect(token).toBeTruthy();
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(expect.anything(), token, [
      NotifierTypes.EMAIL,
    ]);

    const resetResponse = await reset(token ?? '', newPassword);

    expect(resetResponse.body.errors).toBeUndefined();
    expect(resetResponse.body.data.resetPassword).toEqual(true);
    const oldLogin = await signIn(email, password);
    expect(oldLogin.body.errors?.[0].extensions.code).toEqual(
      'UNAUTHENTICATED',
    );
    const newLogin = await signIn(email, newPassword);
    expect(newLogin.body.errors).toBeUndefined();
    expect(newLogin.body.data.signIn.accessToken).toBeDefined();
  });

  it('Should answer an unknown email like a registered one, but send nothing', async () => {
    const response = await restore('nobody.restore@example.com');

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.restorePassword.success).toEqual(true);
    expect(response.body.data.restorePassword.token).toBeNull();
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('Should reject a token that was already used', async () => {
    const email = 'restore.reuse@example.com';
    await signUp(email);
    const token = (await restore(email)).body.data.restorePassword.token;
    await reset(token ?? '', newPassword);

    const second = await reset(token ?? '', 'another password');

    expect(second.body.errors?.[0].extensions.code).toEqual('UNAUTHENTICATED');
    expect(second.body.errors?.[0].message).toEqual(INVALID_RESET_TOKEN);
  });

  it('Should reject an expired token and keep the current password', async () => {
    const email = 'restore.expired@example.com';
    await signUp(email);
    const token = (await restore(email)).body.data.restorePassword.token;
    await prismaService.accountIdentity.updateMany({
      where: { Account: { AccountProfile: { email } } },
      data: { resetTokenExpiresAt: new Date(Date.now() - 1000) },
    });

    const response = await reset(token ?? '', newPassword);

    expect(response.body.errors?.[0].message).toEqual(INVALID_RESET_TOKEN);
    const login = await signIn(email, password);
    expect(login.body.errors).toBeUndefined();
  });

  it('Should invalidate the first token when a second one is requested', async () => {
    const email = 'restore.twice@example.com';
    await signUp(email);
    const first = (await restore(email)).body.data.restorePassword.token;
    const second = (await restore(email)).body.data.restorePassword.token;

    const withFirst = await reset(first ?? '', newPassword);
    const withSecond = await reset(second ?? '', newPassword);

    expect(withFirst.body.errors?.[0].message).toEqual(INVALID_RESET_TOKEN);
    expect(withSecond.body.errors).toBeUndefined();
  });

  it('Should return a validation error for a malformed email', async () => {
    const response = await restore('not-an-email');

    const messages = [
      response.body.errors?.[0].extensions.originalError.message,
    ].flat();
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/email/i)]),
    );
  });

  it('Should return a validation error for a new password under 8 bytes', async () => {
    const response = await reset('any-token', '1234567');

    const messages = [
      response.body.errors?.[0].extensions.originalError.message,
    ].flat();
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/newPassword/i)]),
    );
  });

  afterEach(async () => {
    notifySpy.mockRestore();
    await app.close();
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });
});
