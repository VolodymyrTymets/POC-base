import request from 'supertest';
import { type GraphQLResponseType } from './interfaces/types';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AccountEntity } from '../../../src/account/entities/account.entity';

export class SignInService {
  constructor(app: INestApplication<App>) {
    this.app = app;
  }
  private readonly app: INestApplication<App>;

  async signInOtp(phoneNumber: string) {
    const response = (await request(this.app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          signInOtp(signInInput: {
            phoneNumber: "${phoneNumber}"
          }) {
            code
          }
        }`,
      })
      .expect(200)) as GraphQLResponseType<{ signInOtp: { code: string } }>;
    const code = response.body.data.signInOtp.code;
    const verifyResponse = (await request(this.app.getHttpServer())
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
      .expect(200)) as GraphQLResponseType<{
      verifyOtp: { accessToken: string; refreshToken: string };
    }>;

    const accessToken = verifyResponse.body.data.verifyOtp.accessToken;
    const refreshToken = verifyResponse.body.data.verifyOtp.refreshToken;

    return { accessToken, refreshToken };
  }

  async getAccount(accessToken: string) {
    const verifyResponse = (await request(this.app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: `query {
          account {
            id
          }
        }`,
      })
      .expect(200)) as GraphQLResponseType<{
      account: AccountEntity;
    }>;

    return verifyResponse.body.data.account;
  }
}
