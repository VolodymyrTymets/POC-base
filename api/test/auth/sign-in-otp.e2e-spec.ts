import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { DataCooker } from '../utils/DataCooker/DataCooker';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OtpCodeGeneratorService } from '../../src/auth/services/otp-auth-strategy/otp-code-generator/otp-code-generator.service';
import type { GraphQLResponseType } from '../utils/e2e-services/interfaces/types';
import { SignInService } from '../utils/e2e-services/sign-in.service';
import { AccountRoleType } from '../../generated/prisma/enums';
import { PrismaAdapterMockFactory } from '../utils/mock-services/prisma.adapter.factory';
import { PrismaAdapterFactory } from '../../src/prisma/prisma.adapter.factory';

describe('Sign in otp (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: PrismaService;
  let signInService: SignInService;

  const dataCooker = new DataCooker();
  const otpCodeGenerator = new OtpCodeGeneratorService();

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

  it('Should sign in with otp', async () => {
    const phoneNumber = '+12125551234';

    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          signInOtp(signInInput: {
            phoneNumber: "${phoneNumber}",
          }) { code }
        }`,
      })
      .expect(200);
    expect(response.body.data.signInOtp).toBeDefined();

    const account = await prismaService.account.findFirst({
      where: { AccountProfile: { phoneNumber } },
      select: { id: true },
    });
    expect(account).toBeDefined();
    expect(account?.id).toBeDefined();

    // generate OTP code

    const code1 = otpCodeGenerator.generateCode();
    const { hash: hash1 } = await otpCodeGenerator.hashCode(code1);

    await prismaService.accountIdentity.update({
      where: { accountId: account?.id },
      data: { otpHash: hash1 },
    });

    const verifyResponse = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          verifyOtp(verifyOtpInput: {
            phoneNumber: "${phoneNumber}",
            code: "${code1}"
          }) {
            accessToken
            refreshToken
          }
        }`,
      })
      .expect(200);
    expect(verifyResponse.body.data.verifyOtp.accessToken).toBeDefined();
    expect(verifyResponse.body.data.verifyOtp.refreshToken).toBeDefined();

    const accessToken = verifyResponse.body.data.verifyOtp.accessToken;

    const accountResponse = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: `query {
          account {
            id
            AccountProfile {
              id
              phoneNumber
              isPhoneVerified
            }
          }
        }`,
      })
      .expect(200);

    expect(accountResponse.body.data.account.id).toBeDefined();
    expect(accountResponse.body.data.account.id).toEqual(account.id);
    expect(accountResponse.body.data.account.AccountProfile).toBeDefined();
    expect(
      accountResponse.body.data.account.AccountProfile.phoneNumber,
    ).toEqual(phoneNumber);
    expect(
      accountResponse.body.data.account.AccountProfile.isPhoneVerified,
    ).toBeDefined();
    expect(
      accountResponse.body.data.account.AccountProfile.isPhoneVerified,
    ).toEqual(true);
    const accountId = accountResponse.body.data.account.id as string;
    const accountRole = await prismaService.accountRole.findMany({
      where: {
        AccountOnRole: {
          some: {
            accountId,
          },
        },
      },
      select: {
        type: true,
      },
    });
    expect(accountRole.length).toEqual(1);
    expect(accountRole[0].type).toEqual(AccountRoleType.CUSTOMER);
  });

  it('Should not sign in if otp is not valid', async () => {
    const phoneNumber = '+12125551234';
    const code = '123456';
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          signInOtp(signInInput: {
            phoneNumber: "${phoneNumber}",
          }) { code }
        }`,
      })
      .expect(200);
    expect(response.body.data.signInOtp).toBeDefined();
    const verifyResponse = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          verifyOtp(verifyOtpInput: {
            phoneNumber: "${phoneNumber}",
            code: "${code}"
          }) {
            accessToken
            refreshToken
          }
        }`,
      })
      .expect(200);
    expect(verifyResponse.body.errors).toBeDefined();
    expect(verifyResponse.body.errors[0].extensions?.code).toEqual(
      'UNAUTHENTICATED',
    );
  });

  it('Should not sign in if token is not valid', async () => {
    const phoneNumber = '+12125551234';

    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          signInOtp(signInInput: {
            phoneNumber: "${phoneNumber}",
          }) { code }
        }`,
      })
      .expect(200);
    expect(response.body.data.signInOtp).toBeDefined();

    const account = await prismaService.account.findFirst({
      where: { AccountProfile: { phoneNumber } },
      select: { id: true },
    });
    expect(account).toBeDefined();
    expect(account?.id).toBeDefined();

    // generate OTP code

    const code1 = otpCodeGenerator.generateCode();
    const { hash: hash1 } = await otpCodeGenerator.hashCode(code1);

    await prismaService.accountIdentity.update({
      where: { accountId: account?.id },
      data: { otpHash: hash1 },
    });

    const verifyResponse = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          verifyOtp(verifyOtpInput: {
            phoneNumber: "${phoneNumber}",
            code: "${code1}"
          }) {
            accessToken
            refreshToken
          }
        }`,
      })
      .expect(200);
    expect(verifyResponse.body.data.verifyOtp.accessToken).toBeDefined();
    expect(verifyResponse.body.data.verifyOtp.refreshToken).toBeDefined();

    const accessToken = verifyResponse.body.data.verifyOtp.accessToken;

    const accountResponse = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken + 'test'}`)
      .send({
        query: `query {
          account {
            id
            AccountProfile {
              id
              phoneNumber
              isPhoneVerified
            }
          }
        }`,
      })
      .expect(200);

    expect(accountResponse.body.errors).toBeDefined();
    expect(accountResponse.body.errors[0].extensions?.code).toEqual(
      'UNAUTHENTICATED',
    );
  });

  it('Should return error if phone number is not valid', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          signInOtp(signInInput: {
            phoneNumber: "invalid-phone",
          }) { code }
        }`,
      })
      .expect(200);

    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0]).toBeDefined();
    const errorMessages =
      response.body.errors[0].extensions?.originalError?.message;
    expect(errorMessages).toBeDefined();
    expect(errorMessages[0]).toMatch(/phone number/i);
  });

  it("Shouldn't sign in if access token is expired", async () => {
    const phoneNumber = '+12125551234';
    const originalExpiresIn = process.env.JWT_REFRESH_TOKEN_EXPIRES_IN;
    // Issue access token that expires almost immediately so we can assert
    // the expired-token flow without waiting the default 15 minutes.
    process.env.JWT_ACCESS_TOKEN_EXPIRES_IN = '1s';

    try {
      const { accessToken } = await signInService.signInOtp(phoneNumber);

      // Wait for the access token to expire.
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const response = (await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${accessToken + 'test'}`)
        .send({
          query: `query {
          account {
            id
          }
        }`,
        })
        .expect(200)) as GraphQLResponseType<{
        account: { id: string };
      }>;

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].extensions?.code).toEqual(
        'UNAUTHENTICATED',
      );
    } finally {
      process.env.JWT_ACCESS_TOKEN_EXPIRES_IN = originalExpiresIn;
    }
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });
});
