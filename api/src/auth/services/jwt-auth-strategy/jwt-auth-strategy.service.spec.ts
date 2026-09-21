import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcrypt';
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
import { AccountService } from '../../../account/account.service';
import { AccountRoleType } from '../../../../generated/prisma/enums';
import { INVALID_CREDENTIALS } from '../../../common/errors';

describe('JwtAuthStrategyService', () => {
  let jwtAuthStrategyService: JwtAuthStrategyService;
  let prismaService: PrismaService;
  let accountService: AccountService;
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
      providers: [
        JwtAuthStrategyService,
        AccountService,
        JwtStrategy,
        GqlAuthGuard,
      ],
    })
      .overrideProvider(PrismaAdapterFactory)
      .useValue(new PrismaAdapterMockFactory(dataCooker.getPgLitle()))
      .compile();

    jwtAuthStrategyService = app.get<JwtAuthStrategyService>(
      JwtAuthStrategyService,
    );
    prismaService = app.get<PrismaService>(PrismaService);
    accountService = app.get<AccountService>(AccountService);
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

  describe('signUp', () => {
    it('should create a customer account with a bcrypt password hash and return tokens', async () => {
      const result = await jwtAuthStrategyService.signUp({
        email: '  New.User@Example.com ',
        password: 'correct horse',
      });

      const profile = await prismaService.accountProfile.findFirstOrThrow({
        where: { email: 'new.user@example.com' },
        include: {
          Account: {
            include: {
              AccountIdentity: true,
              AccountOnRole: { include: { AccountRole: true } },
            },
          },
        },
      });
      const identity = profile.Account.AccountIdentity;
      expect(result.accessToken.length).toBeGreaterThan(0);
      expect(result.refreshToken.length).toBeGreaterThan(0);
      expect(identity?.hash).toBeDefined();
      expect(identity?.hash).not.toBe('correct horse');
      expect(await compare('correct horse', identity?.hash ?? '')).toBe(true);
      expect(
        profile.Account.AccountOnRole.map((r) => r.AccountRole.type),
      ).toEqual([AccountRoleType.CUSTOMER]);
    });

    it('should not mark the phone as verified', async () => {
      await jwtAuthStrategyService.signUp({
        email: 'unverified@example.com',
        password: 'correct horse',
      });

      const profile = await prismaService.accountProfile.findFirstOrThrow({
        where: { email: 'unverified@example.com' },
      });
      expect(profile.isPhoneVerified).toBe(false);
    });

    it('should reject an email that is already registered, ignoring case', async () => {
      await jwtAuthStrategyService.signUp({
        email: 'taken@example.com',
        password: 'correct horse',
      });

      await expect(
        jwtAuthStrategyService.signUp({
          email: 'TAKEN@example.com',
          password: 'another password',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should keep the email reserved when its profile is soft-deleted', async () => {
      await jwtAuthStrategyService.signUp({
        email: 'gone@example.com',
        password: 'correct horse',
      });
      await prismaService.accountProfile.updateMany({
        where: { email: 'gone@example.com' },
        data: { deleted: true },
      });

      await expect(
        jwtAuthStrategyService.signUp({
          email: 'gone@example.com',
          password: 'correct horse',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should leave no partial account behind when a nested write fails', async () => {
      // Calling createPasswordAccount directly skips signUp's pre-check, so the
      // second call fails inside the nested create on the @unique email.
      await accountService.createPasswordAccount('race@example.com', 'h', 's');
      const accountsBefore = await prismaService.account.count();
      const identitiesBefore = await prismaService.accountIdentity.count();

      await expect(
        accountService.createPasswordAccount('race@example.com', 'h', 's'),
      ).rejects.toThrow();

      expect(await prismaService.account.count()).toBe(accountsBefore);
      expect(await prismaService.accountIdentity.count()).toBe(
        identitiesBefore,
      );
    });
  });

  describe('signIn', () => {
    const password = 'correct horse';
    let email: string;
    let emailCounter = 0;

    beforeEach(async () => {
      // DataCooker keeps rows between tests in a file, so each test gets its own email
      email = `signin.user.${++emailCounter}@example.com`;
      await jwtAuthStrategyService.signUp({ email, password });
    });

    it('should return tokens for the right email and password, ignoring email case', async () => {
      const result = await jwtAuthStrategyService.signIn({
        email: email.toUpperCase(),
        password,
      });

      expect(result.accessToken.length).toBeGreaterThan(0);
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('should throw UnauthorizedException for a wrong password', async () => {
      await expect(
        jwtAuthStrategyService.signIn({ email, password: 'wrong password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw the same error for an unknown email as for a wrong password', async () => {
      await expect(
        jwtAuthStrategyService.signIn({ email, password: 'wrong password' }),
      ).rejects.toThrow(INVALID_CREDENTIALS);
      await expect(
        jwtAuthStrategyService.signIn({
          email: 'nobody@example.com',
          password: 'wrong password',
        }),
      ).rejects.toThrow(INVALID_CREDENTIALS);
    });

    it('should throw UnauthorizedException for an account that only has an OTP identity', async () => {
      const account = await createAccountWithIdentity('+8888888888');
      await prismaService.accountProfile.update({
        where: { accountId: account.id },
        data: { email: 'otp.only@example.com' },
      });

      await expect(
        jwtAuthStrategyService.signIn({
          email: 'otp.only@example.com',
          password,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for a soft-deleted account', async () => {
      await prismaService.account.updateMany({
        where: { AccountProfile: { email } },
        data: { deleted: true },
      });

      await expect(
        jwtAuthStrategyService.signIn({ email, password }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should not mark the phone as verified', async () => {
      const account = await createAccountWithIdentity('+9999999999');
      const passwordHash = await hash(password, 10);
      await prismaService.accountProfile.update({
        where: { accountId: account.id },
        data: { email: 'with.phone@example.com' },
      });
      await prismaService.accountIdentity.update({
        where: { accountId: account.id },
        data: { hash: passwordHash },
      });

      await jwtAuthStrategyService.signIn({
        email: 'with.phone@example.com',
        password,
      });

      const profile = await prismaService.accountProfile.findFirstOrThrow({
        where: { accountId: account.id },
      });
      expect(profile.isPhoneVerified).toBe(false);
    });
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

    // WHY: KAN-12 - was "should mark account phone as verified". Refreshing tokens must not verify a
    // phone; verifyOtp owns that (human-approved in plan).
    it('should not mark account phone as verified', async () => {
      const account = await createAccountWithIdentity('+6666666666');

      await jwtAuthStrategyService.refreshToken(account.id);

      const profile = await prismaService.accountProfile.findFirst({
        where: { accountId: account.id },
      });

      expect(profile.isPhoneVerified).toBe(false);
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
