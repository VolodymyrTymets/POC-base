import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { DataCooker } from '../utils/DataCooker/DataCooker';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { GraphQLResponseType } from '../utils/e2e-services/interfaces/types';
import { SignInService } from '../utils/e2e-services/sign-in.service';
import { AccountProfileEntity } from '../../src/account-profile/entities/account-profile.entity';
import { FORBIDDEN, UNAUTHORIZED } from '../../src/common/errors';

// todo: refactor according to e2e service logic
describe('Update account profile (e2e)', () => {
  let app: INestApplication<App>;
  let signInService: SignInService;
  let prismaService: PrismaService;
  const dataCooker = new DataCooker();

  beforeAll(async () => {
    await dataCooker.beforeAll();
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prismaService = await moduleFixture.resolve(PrismaService);
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    signInService = new SignInService(app);
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });

  it('Should throw error when not authenticated', async () => {
    const phoneNumber = '+12125551234';
    const { accessToken } = await signInService.signInOtp(phoneNumber);
    const { id: accountId } = await signInService.getAccount(accessToken);
    const response = (await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          updateAccountProfile(accountId: "${accountId}", accountProfileInput:{}) {
            id
          }
        }`,
      })
      .expect(200)) as GraphQLResponseType<{
      updateAccountProfile: AccountProfileEntity;
    }>;
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].message).toEqual(UNAUTHORIZED);
  });

  it('Should throw error when account profile does not exist', async () => {
    const phoneNumber = '+12125551231';
    const { accessToken } = await signInService.signInOtp(phoneNumber);
    const response = (await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: `mutation {
          updateAccountProfile(accountId: "${'00000000-0000-0000-0000-000000000000'}", accountProfileInput:{}) {
            id
          }
        }`,
      })
      .expect(200)) as GraphQLResponseType<{
      updateAccountProfile: AccountProfileEntity;
    }>;
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].extensions?.originalError.message).toEqual(
      FORBIDDEN,
    );
  });

  it('Should update account profile', async () => {
    const phoneNumber = '+12125551231';
    const { accessToken } = await signInService.signInOtp(phoneNumber);
    const { id: accountId } = await signInService.getAccount(accessToken);
    const input = {
      firstName: 'test',
      lastName: 'test',
      email: 'test@test',
      SSN: '1212',
      is18YearOld: true,
    };

    const response = (await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: `mutation {
          updateAccountProfile(accountId:"${accountId}", accountProfileInput: {
            firstName: "${input.firstName}"
            lastName: "${input.lastName}"
            email: "${input.email}"
            SSN: "${input.SSN}"
            is18YearOld: true
          }){
            id
            firstName
            lastName
            email
            SSN
          }
        }`,
      })
      .expect(200)) as GraphQLResponseType<{
      updateAccountProfile: AccountProfileEntity;
    }>;
    expect(response.body.data.updateAccountProfile).toBeDefined();
    expect(response.body.data.updateAccountProfile.firstName).toEqual(
      input.firstName,
    );
    expect(response.body.data.updateAccountProfile.lastName).toEqual(
      input.lastName,
    );
    expect(response.body.data.updateAccountProfile.email).toEqual(input.email);
    expect(response.body.data.updateAccountProfile.SSN).toEqual(input.SSN);
    const dbRecord = await prismaService.accountProfile.findFirst({
      where: {
        accountId,
      },
    });
    expect(dbRecord?.is18YearOld).toEqual(input.is18YearOld);
  });

  it('Should be able update only own account profile', async () => {
    const phoneNumber1 = '+12125551231';
    const phoneNumber2 = '+12125551232';
    const { accessToken } = await signInService.signInOtp(phoneNumber1);
    const { id: accountId1 } = await signInService.getAccount(accessToken);
    const { accessToken: accessToken2 } =
      await signInService.signInOtp(phoneNumber2);
    const response = (await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken2}`)
      .send({
        query: `mutation {
          updateAccountProfile(accountId: "${accountId1}", accountProfileInput:{}) {
            id
          }
        }`,
      })
      .expect(200)) as GraphQLResponseType<{
      updateAccountProfile: AccountProfileEntity;
    }>;
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].extensions?.originalError.message).toEqual(
      FORBIDDEN,
    );
  });

  it('Should add avatar to account profile', async () => {
    // todo: implement this test
    const phoneNumber = '+12125551231';
    const { accessToken } = await signInService.signInOtp(phoneNumber);
    expect(true).toEqual(false);
  })
});
