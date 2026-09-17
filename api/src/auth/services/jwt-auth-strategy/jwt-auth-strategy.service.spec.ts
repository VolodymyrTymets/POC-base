import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcrypt';
import { JwtAuthStrategyService } from './jwt-auth-strategy.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { DataCooker } from '../../../../test/utils/DataCooker/DataCooker';
import { PrismaAdapterMockFactory } from '../../../../test/utils/mock-services/prisma.adapter.factory';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaAdapterFactory } from '../../../prisma/prisma.adapter.factory';
import { JwtStrategy } from '../../strategies/jwt.strategy';
import { GqlAuthGuard } from '../../guards/gql-auth.guard';
import { AccountRoleModule } from '../../../account-role/account-role.module';

describe('JwtAuthStrategyService', () => {
  let jwtAuthStrategyService: JwtAuthStrategyService;
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
      providers: [JwtAuthStrategyService, JwtStrategy, GqlAuthGuard],
    })
      .overrideProvider(PrismaAdapterFactory)
      .useValue(new PrismaAdapterMockFactory(dataCooker.getPgLitle()))
      .compile();

    jwtAuthStrategyService = app.get<JwtAuthStrategyService>(
      JwtAuthStrategyService,
    );
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
    expect(jwtAuthStrategyService).toBeDefined();
  });

  describe('validateRefreshToken', () => {
    it('should return accountId when refresh token is valid', async () => {
      const account = await createAccountWithIdentity('+1234567890');
      const rawToken = 'test-refresh-token';
      const hashedToken = await hash(rawToken, 10);

      await prismaService.accountIdentity.update({
        where: { accountId: account.id },
        data: { refreshToken: hashedToken },
      });

      const result = await jwtAuthStrategyService.validateRefreshToken(
        account.id,
        rawToken,
      );

      expect(result).toEqual({ accountId: account.id });
    });

    it('should throw UnauthorizedException when account identity does not exist', async () => {
      await expect(
        jwtAuthStrategyService.validateRefreshToken(
          'non-existent-id',
          'any-token',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when refreshToken is null', async () => {
      const account = await createAccountWithIdentity('+2222222222');

      await expect(
        jwtAuthStrategyService.validateRefreshToken(account.id, 'any-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when refresh token does not match', async () => {
      const account = await createAccountWithIdentity('+3333333333');
      const hashedToken = await hash('correct-token', 10);

      await prismaService.accountIdentity.update({
        where: { accountId: account.id },
        data: { refreshToken: hashedToken },
      });

      await expect(
        jwtAuthStrategyService.validateRefreshToken(account.id, 'wrong-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should return accessToken and refreshToken strings', async () => {
      const account = await createAccountWithIdentity('+4444444444');

      const result = await jwtAuthStrategyService.refreshToken(account.id);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('should store hashed refresh token in database', async () => {
      const account = await createAccountWithIdentity('+5555555555');

      const result = await jwtAuthStrategyService.refreshToken(account.id);

      const identity = await prismaService.accountIdentity.findFirst({
        where: { accountId: account.id },
      });

      expect(identity.refreshToken).toBeDefined();
      expect(identity.refreshToken).not.toBe(result.refreshToken);
      expect(identity.refreshToken.length).toBeGreaterThan(20);
    });

    it('should mark account phone as verified', async () => {
      const account = await createAccountWithIdentity('+6666666666');

      await jwtAuthStrategyService.refreshToken(account.id);

      const profile = await prismaService.accountProfile.findFirst({
        where: { accountId: account.id },
      });

      expect(profile.isPhoneVerified).toBe(true);
    });

    it('should generate different tokens on subsequent calls', async () => {
      const account = await createAccountWithIdentity('+7777777777');

      const result1 = await jwtAuthStrategyService.refreshToken(account.id);
      const result2 = await jwtAuthStrategyService.refreshToken(account.id);

      expect(result1.accessToken).not.toBe(result2.accessToken);
      expect(result1.refreshToken).not.toBe(result2.refreshToken);
    });
  });
});
