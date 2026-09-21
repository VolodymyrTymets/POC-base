import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { DataCooker } from '../utils/DataCooker/DataCooker';
import type { GraphQLResponseType } from '../utils/e2e-services/interfaces/types';
import { PrismaAdapterMockFactory } from '../utils/mock-services/prisma.adapter.factory';
import { PrismaAdapterFactory } from '../../src/prisma/prisma.adapter.factory';
import { INVALID_CREDENTIALS } from '../../src/common/errors';

type Tokens = { accessToken: string; refreshToken: string };

describe('Change password (e2e)', () => {
  let app: INestApplication<App>;

  const dataCooker = new DataCooker();
  const password = 'correct horse';
  const newPassword = 'battery staple';

  const graphql = async <T>(
    query: string,
    variables: object,
    accessToken?: string,
  ) => {
    const req = request(app.getHttpServer()).post('/graphql');
    if (accessToken) {
      req.set('Authorization', `Bearer ${accessToken}`);
    }
    return (await req.send({ query, variables }).expect(200)) as T;
  };

  const signUp = async (email: string) => {
    const response = await graphql<GraphQLResponseType<{ signUp: Tokens }>>(
      `mutation($input: SignUpInput!) {
        signUp(signUpInput: $input) { accessToken refreshToken }
      }`,
      { input: { email, password } },
    );
    return response.body.data.signUp;
  };

  const signIn = (email: string, pass: string) =>
    graphql<GraphQLResponseType<{ signIn: Tokens }>>(
      `mutation($input: PasswordSignInInput!) {
        signIn(signInInput: $input) { accessToken refreshToken }
      }`,
      { input: { email, password: pass } },
    );

  const changePassword = (
    current: string,
    next: string,
    accessToken?: string,
  ) =>
    graphql<GraphQLResponseType<{ changePassword: boolean }>>(
      `mutation($input: ChangePasswordInput!) {
        changePassword(changePasswordInput: $input)
      }`,
      { input: { currentPassword: current, newPassword: next } },
      accessToken,
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
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  it('Should change the password: the old one stops working, the new one signs in', async () => {
    const email = 'change.ok@example.com';
    const { accessToken } = await signUp(email);

    const response = await changePassword(password, newPassword, accessToken);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.changePassword).toEqual(true);
    const oldLogin = await signIn(email, password);
    expect(oldLogin.body.errors?.[0].extensions.code).toEqual(
      'UNAUTHENTICATED',
    );
    const newLogin = await signIn(email, newPassword);
    expect(newLogin.body.errors).toBeUndefined();
    expect(newLogin.body.data.signIn.accessToken).toBeDefined();
  });

  // Known limit, not pinned here: bcrypt only hashes the first 72 bytes of a
  // refresh JWT, so once the account signs in again its older refresh tokens
  // match the new stored hash. See docs/features/KAN-12/spec.md, open question 6.
  it('Should clear the stored refresh token so the pre-change one is rejected', async () => {
    const refresh = async (refreshToken: string) =>
      (await request(app.getHttpServer())
        .post('/graphql')
        .set('x-refresh-token', refreshToken)
        .send({
          query: `mutation { refreshToken { accessToken refreshToken } }`,
        })
        .expect(200)) as GraphQLResponseType<{ refreshToken: Tokens }>;

    // control: an untouched account's refresh token works through this header,
    // so a rejection below is caused by the password change, not a bad request
    const control = await signUp('change.refresh.control@example.com');
    const controlResponse = await refresh(control.refreshToken);
    expect(controlResponse.body.errors).toBeUndefined();

    const { accessToken, refreshToken } = await signUp(
      'change.refresh@example.com',
    );
    await changePassword(password, newPassword, accessToken);
    const response = await refresh(refreshToken);

    expect(response.body.errors?.[0].extensions.code).toEqual(
      'UNAUTHENTICATED',
    );
  });

  it('Should reject a wrong current password and leave the password unchanged', async () => {
    const email = 'change.wrong@example.com';
    const { accessToken } = await signUp(email);

    const response = await changePassword(
      'wrong password',
      newPassword,
      accessToken,
    );

    expect(response.body.errors?.[0].extensions.code).toEqual(
      'UNAUTHENTICATED',
    );
    expect(response.body.errors?.[0].message).toEqual(INVALID_CREDENTIALS);
    const login = await signIn(email, password);
    expect(login.body.errors).toBeUndefined();
  });

  it('Should reject the call without an access token', async () => {
    const response = await changePassword(password, newPassword);

    expect(response.body.errors?.[0].extensions.code).toEqual(
      'UNAUTHENTICATED',
    );
  });

  it('Should return a validation error for a new password under 8 bytes', async () => {
    const { accessToken } = await signUp('change.short@example.com');

    const response = await changePassword(password, '1234567', accessToken);

    const messages = [
      response.body.errors?.[0].extensions.originalError.message,
    ].flat();
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/newPassword/i)]),
    );
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });
});
