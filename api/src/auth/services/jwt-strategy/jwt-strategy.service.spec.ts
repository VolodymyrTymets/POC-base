import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { JwtStrategyService } from './jwt-strategy.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataCooker } from '../../../../test/utils/DataCooker/DataCooker';
import { AccountRoleModule } from '../../../account-role/account-role.module';

@Injectable()
class TestJwtStrategyService extends JwtStrategyService {
  constructor(
    protected readonly prismaService: PrismaService,
    protected readonly jwtService: JwtService,
    protected readonly configService: ConfigService,
  ) {
    super(prismaService, jwtService, configService);
  }
}

describe('JwtStrategyService', () => {
  let jwtStrategyService: TestJwtStrategyService;
  let prismaService: PrismaService;
  const dataCooker = new DataCooker();

  beforeAll(async () => {
    await dataCooker.beforeAll();
  });

  beforeEach(async () => {
    await dataCooker.beforeEach();
    const app: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        PrismaModule,
        PassportModule,
        AccountRoleModule,
        JwtModule.register({
          secret: 'test-jwt-secret',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [TestJwtStrategyService],
    }).compile();

    jwtStrategyService = app.get<TestJwtStrategyService>(TestJwtStrategyService);
    prismaService = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });

  async function createAccountWithIdentity(phoneNumber: string) {
    const account = await prismaService.account.create({
      data: { lastLoginAt: new Date() },
    });
    await prismaService.accountProfile.create({
      data: { accountId: account.id, phoneNumber },
    });
    await prismaService.accountIdentity.create({
      data: { accountId: account.id },
    });
    return account;
  }

  it('should be defined', () => {
    expect(jwtStrategyService).toBeDefined();
  });

  describe('refreshTokens', () => {
    it('should return accessToken and refreshToken strings', async () => {
      const account = await createAccountWithIdentity('+1234567890');

      const result = await jwtStrategyService.refreshTokens(account.id);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('should store hashed refresh token in database', async () => {
      const account = await createAccountWithIdentity('+2222222222');

      const result = await jwtStrategyService.refreshTokens(account.id);

      const identity = await prismaService.accountIdentity.findFirst({
        where: { accountId: account.id },
      });

      expect(identity.refreshToken).toBeDefined();
      expect(identity.refreshToken).not.toBe(result.refreshToken);
      expect(identity.refreshToken.length).toBeGreaterThan(20);
    });

    it('should mark account phone as verified', async () => {
      const account = await createAccountWithIdentity('+3333333333');

      await jwtStrategyService.refreshTokens(account.id);

      const profile = await prismaService.accountProfile.findFirst({
        where: { accountId: account.id },
      });

      expect(profile.isPhoneVerified).toBe(true);
    });

    it('should generate different tokens on subsequent calls', async () => {
      const account = await createAccountWithIdentity('+4444444444');

      const result1 = await jwtStrategyService.refreshTokens(account.id);
      const result2 = await jwtStrategyService.refreshTokens(account.id);

      expect(result1.accessToken).not.toBe(result2.accessToken);
      expect(result1.refreshToken).not.toBe(result2.refreshToken);
    });

    it('should update stored hash on subsequent calls', async () => {
      const account = await createAccountWithIdentity('+5555555555');

      await jwtStrategyService.refreshTokens(account.id);
      const identity1 = await prismaService.accountIdentity.findFirst({
        where: { accountId: account.id },
      });

      await jwtStrategyService.refreshTokens(account.id);
      const identity2 = await prismaService.accountIdentity.findFirst({
        where: { accountId: account.id },
      });

      expect(identity1.refreshToken).not.toBe(identity2.refreshToken);
    });
  });
});
