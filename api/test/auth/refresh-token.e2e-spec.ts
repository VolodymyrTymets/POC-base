import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { DataCooker } from '../utils/DataCooker/DataCooker';
import { SignInService } from '../utils/e2e-services/sign-in.service';
import type { GraphQLResponseType } from '../utils/e2e-services/interfaces/types';

describe('Refresh token (e2e)', () => {
  let app: INestApplication<App>;
  const dataCooker = new DataCooker();
  let signInService: SignInService;

  beforeAll(async () => {
    await dataCooker.beforeAll();
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    signInService = new SignInService(app);
  });

  it('Should refresh token', async () => {
    const phoneNumber = '+12125551234';

    const { refreshToken } = await signInService.signInOtp(phoneNumber);

    const response = (await request(app.getHttpServer())
      .post('/graphql')
      .set('x-refresh-token', `${refreshToken}`)
      .send({
        query: `mutation {
          refreshToken {
            accessToken
            refreshToken
          }
        }`,
      })
      .expect(200)) as GraphQLResponseType<{
      refreshToken: { refreshToken: string };
    }>;

    expect(response.body.data.refreshToken.refreshToken).toBeDefined();
    expect(response.body.data.refreshToken.refreshToken).not.toEqual(
      refreshToken,
    );
  });

  it("Shouldn't refresh token if refresh token is invalid", async () => {
    const phoneNumber = '+12125551234';

    const { refreshToken } = await signInService.signInOtp(phoneNumber);

    const response = (await request(app.getHttpServer())
      .post('/graphql')
      .set('x-refresh-token', `${refreshToken + 'invalid-token'}`)
      .send({
        query: `mutation {
          refreshToken {
            accessToken
            refreshToken
          }
        }`,
      })
      .expect(200)) as GraphQLResponseType<{
      refreshToken: { refreshToken: string };
    }>;

    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].extensions?.code).toEqual('UNAUTHENTICATED');
  });

  it("Shouldn't refresh token if refresh token is expired", async () => {
    const phoneNumber = '+12125551234';
    const originalExpiresIn = process.env.JWT_REFRESH_TOKEN_EXPIRES_IN;
    // Issue a refresh token that expires almost immediately so we can assert
    // the expired-token flow without waiting the default 7 days.
    process.env.JWT_REFRESH_TOKEN_EXPIRES_IN = '1s';

    try {
      const { refreshToken } = await signInService.signInOtp(phoneNumber);

      // Wait for the refresh token to expire.
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const response = (await request(app.getHttpServer())
        .post('/graphql')
        .set('x-refresh-token', `${refreshToken}`)
        .send({
          query: `mutation {
            refreshToken {
              accessToken
              refreshToken
            }
          }`,
        })
        .expect(200)) as GraphQLResponseType<{
        refreshToken: { refreshToken: string };
      }>;

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].extensions?.code).toEqual(
        'UNAUTHENTICATED',
      );
    } finally {
      process.env.JWT_REFRESH_TOKEN_EXPIRES_IN = originalExpiresIn;
    }
  });

  it('Should refresh token if sign Out', async () => {
    const phoneNumber = '+12125551234';
    const { refreshToken, accessToken } =
      await signInService.signInOtp(phoneNumber);

    await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: `mutation {
          signOut
        }`,
      })
      .expect(200);
    const response = (await request(app.getHttpServer())
      .post('/graphql')
      .set('x-refresh-token', `${refreshToken}`)
      .send({
        query: `mutation {
            refreshToken {
              accessToken
              refreshToken
            }
          }`,
      })
      .expect(200)) as GraphQLResponseType<{
      refreshToken: { refreshToken: string };
    }>;
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].extensions?.code).toEqual('UNAUTHENTICATED');
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });
});
