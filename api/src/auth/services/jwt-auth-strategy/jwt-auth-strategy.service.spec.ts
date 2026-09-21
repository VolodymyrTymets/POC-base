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
import {
  INVALID_CREDENTIALS,
  INVALID_RESET_TOKEN,
} from '../../../common/errors';
import { NotifierService } from '../../../notifier/notifier.service';
import { NotifierTypes } from '../../../notifier/notifier.service.interface';
import { createHash } from 'crypto';

describe('JwtAuthStrategyService', () => {
  let jwtAuthStrategyService: JwtAuthStrategyService;
  let prismaService: PrismaService;
  let accountService: AccountService;
  // NotifierService is the boundary to the queue, so it is the mocked edge here
  const notifierService = { notifyAboutPasswordReset: jest.fn() };
  const dataCooker = new DataCooker();

  beforeAll(async () => {
    await dataCooker.beforeAll();
  });

  beforeEach(async () => {
    await dataCooker.beforeEach();
    notifierService.notifyAboutPasswordReset.mockReset();
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
        { provide: NotifierService, useValue: notifierService },
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

  describe('changePassword', () => {
    const password = 'correct horse';
    let email: string;
    let accountId: string;
    let emailCounter = 0;

    beforeEach(async () => {
      email = `change.user.${++emailCounter}@example.com`;
      await jwtAuthStrategyService.signUp({ email, password });
      const profile = await prismaService.accountProfile.findFirstOrThrow({
        where: { email },
      });
      accountId = profile.accountId;
    });

    it('should replace the password: the old one stops working and the new one signs in', async () => {
      await jwtAuthStrategyService.changePassword(accountId, {
        currentPassword: password,
        newPassword: 'battery staple',
      });

      await expect(
        jwtAuthStrategyService.signIn({ email, password }),
      ).rejects.toThrow(UnauthorizedException);
      const tokens = await jwtAuthStrategyService.signIn({
        email,
        password: 'battery staple',
      });
      expect(tokens.accessToken.length).toBeGreaterThan(0);
    });

    it('should reject a wrong current password and keep the stored hash', async () => {
      const before = await prismaService.accountIdentity.findFirstOrThrow({
        where: { accountId },
      });

      await expect(
        jwtAuthStrategyService.changePassword(accountId, {
          currentPassword: 'wrong password',
          newPassword: 'battery staple',
        }),
      ).rejects.toThrow(INVALID_CREDENTIALS);

      const after = await prismaService.accountIdentity.findFirstOrThrow({
        where: { accountId },
      });
      expect(after.hash).toBe(before.hash);
    });

    it('should revoke the stored refresh token', async () => {
      await jwtAuthStrategyService.signIn({ email, password });
      const before = await prismaService.accountIdentity.findFirstOrThrow({
        where: { accountId },
      });
      expect(before.refreshToken).not.toBeNull();

      await jwtAuthStrategyService.changePassword(accountId, {
        currentPassword: password,
        newPassword: 'battery staple',
      });

      const after = await prismaService.accountIdentity.findFirstOrThrow({
        where: { accountId },
      });
      expect(after.refreshToken).toBeNull();
    });

    it('should clear a pending OTP like signOut does', async () => {
      await prismaService.accountIdentity.update({
        where: { accountId },
        data: {
          otpHash: 'pending-otp',
          otpSalt: 'salt',
          otpExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      await jwtAuthStrategyService.changePassword(accountId, {
        currentPassword: password,
        newPassword: 'battery staple',
      });

      const after = await prismaService.accountIdentity.findFirstOrThrow({
        where: { accountId },
      });
      expect(after.otpHash).toBeNull();
      expect(after.otpSalt).toBeNull();
      expect(after.otpExpiresAt).toBeNull();
    });

    it('should invalidate a pending password-reset token', async () => {
      await prismaService.accountIdentity.update({
        where: { accountId },
        data: {
          resetTokenHash: `pending-${accountId}`,
          resetTokenExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      await jwtAuthStrategyService.changePassword(accountId, {
        currentPassword: password,
        newPassword: 'battery staple',
      });

      const after = await prismaService.accountIdentity.findFirstOrThrow({
        where: { accountId },
      });
      expect(after.resetTokenHash).toBeNull();
      expect(after.resetTokenExpiresAt).toBeNull();
    });

    it('should reject an OTP-only account that has no password yet', async () => {
      const otpAccount = await createAccountWithIdentity('+7777000111');

      await expect(
        jwtAuthStrategyService.changePassword(otpAccount.id, {
          currentPassword: password,
          newPassword: 'battery staple',
        }),
      ).rejects.toThrow(INVALID_CREDENTIALS);
    });
  });

  describe('restorePassword and resetPassword', () => {
    const password = 'correct horse';
    let email: string;
    let accountId: string;
    let emailCounter = 0;

    const identityOf = (id: string) =>
      prismaService.accountIdentity.findFirstOrThrow({
        where: { accountId: id },
      });

    beforeEach(async () => {
      email = `restore.user.${++emailCounter}@example.com`;
      await jwtAuthStrategyService.signUp({ email, password });
      const profile = await prismaService.accountProfile.findFirstOrThrow({
        where: { email },
      });
      accountId = profile.accountId;
    });

    describe('restorePassword', () => {
      it('should store only a sha256 hash of the token, with a 30 minute expiry', async () => {
        const token = await jwtAuthStrategyService.restorePassword({ email });

        const identity = await identityOf(accountId);
        expect(token).not.toBeNull();
        expect(identity.resetTokenHash).toBe(
          createHash('sha256')
            .update(token ?? '')
            .digest('hex'),
        );
        expect(identity.resetTokenHash).not.toBe(token);
        const minutesLeft =
          ((identity.resetTokenExpiresAt?.getTime() ?? 0) - Date.now()) / 60000;
        expect(minutesLeft).toBeGreaterThan(29);
        expect(minutesLeft).toBeLessThanOrEqual(30);
      });

      it('should ask the notifier to send the token by email', async () => {
        const token = await jwtAuthStrategyService.restorePassword({ email });

        expect(notifierService.notifyAboutPasswordReset).toHaveBeenCalledTimes(
          1,
        );
        expect(notifierService.notifyAboutPasswordReset).toHaveBeenCalledWith(
          expect.objectContaining({ id: accountId }),
          token,
          [NotifierTypes.EMAIL],
        );
      });

      it('should return null and touch nothing for an unknown email', async () => {
        const identitiesBefore = await prismaService.accountIdentity.count({
          where: { resetTokenHash: { not: null } },
        });

        const token = await jwtAuthStrategyService.restorePassword({
          email: 'nobody@example.com',
        });

        expect(token).toBeNull();
        expect(notifierService.notifyAboutPasswordReset).not.toHaveBeenCalled();
        expect(
          await prismaService.accountIdentity.count({
            where: { resetTokenHash: { not: null } },
          }),
        ).toBe(identitiesBefore);
      });

      it('should not revive a soft-deleted identity: it is treated as an unknown email', async () => {
        await prismaService.accountIdentity.update({
          where: { accountId },
          data: { deleted: true },
        });

        const token = await jwtAuthStrategyService.restorePassword({ email });

        expect(token).toBeNull();
        expect((await identityOf(accountId)).resetTokenHash).toBeNull();
      });

      it('should replace a token that is still live', async () => {
        const first = await jwtAuthStrategyService.restorePassword({ email });
        const second = await jwtAuthStrategyService.restorePassword({ email });

        expect(second).not.toBe(first);
        await expect(
          jwtAuthStrategyService.resetPassword({
            token: first ?? '',
            newPassword: 'battery staple',
          }),
        ).rejects.toThrow(INVALID_RESET_TOKEN);
        await expect(
          jwtAuthStrategyService.resetPassword({
            token: second ?? '',
            newPassword: 'battery staple',
          }),
        ).resolves.toBeUndefined();
      });

      it('should create the identity of an OTP-only account that has an email', async () => {
        const otpAccount = await prismaService.account.create({
          data: {
            lastLoginAt: new Date(),
            AccountProfile: {
              create: { phoneNumber: '+7770001112', email: `otp.${email}` },
            },
          },
        });

        const token = await jwtAuthStrategyService.restorePassword({
          email: `otp.${email}`,
        });

        expect(token).not.toBeNull();
        expect((await identityOf(otpAccount.id)).resetTokenHash).not.toBeNull();
      });
    });

    describe('resetPassword', () => {
      it('should set the new password, consume the token and clear the refresh token', async () => {
        await jwtAuthStrategyService.signIn({ email, password });
        const token = await jwtAuthStrategyService.restorePassword({ email });

        await jwtAuthStrategyService.resetPassword({
          token: token ?? '',
          newPassword: 'battery staple',
        });

        const identity = await identityOf(accountId);
        expect(identity.resetTokenHash).toBeNull();
        expect(identity.resetTokenExpiresAt).toBeNull();
        expect(identity.refreshToken).toBeNull();
        await expect(
          jwtAuthStrategyService.signIn({ email, password }),
        ).rejects.toThrow(UnauthorizedException);
        const tokens = await jwtAuthStrategyService.signIn({
          email,
          password: 'battery staple',
        });
        expect(tokens.accessToken.length).toBeGreaterThan(0);
      });

      it('should clear a pending OTP when the password is reset', async () => {
        await prismaService.accountIdentity.update({
          where: { accountId },
          data: { otpHash: 'pending-otp', otpExpiresAt: new Date(Date.now() + 60_000) },
        });
        const token = await jwtAuthStrategyService.restorePassword({ email });

        await jwtAuthStrategyService.resetPassword({
          token: token ?? '',
          newPassword: 'battery staple',
        });

        const identity = await identityOf(accountId);
        expect(identity.otpHash).toBeNull();
        expect(identity.otpExpiresAt).toBeNull();
      });

      it('should reject a token that was already used', async () => {
        const token = await jwtAuthStrategyService.restorePassword({ email });
        await jwtAuthStrategyService.resetPassword({
          token: token ?? '',
          newPassword: 'battery staple',
        });

        await expect(
          jwtAuthStrategyService.resetPassword({
            token: token ?? '',
            newPassword: 'another one',
          }),
        ).rejects.toThrow(INVALID_RESET_TOKEN);
      });

      it('should reject an expired token and keep the password', async () => {
        const token = await jwtAuthStrategyService.restorePassword({ email });
        await prismaService.accountIdentity.update({
          where: { accountId },
          data: { resetTokenExpiresAt: new Date(Date.now() - 1000) },
        });

        await expect(
          jwtAuthStrategyService.resetPassword({
            token: token ?? '',
            newPassword: 'battery staple',
          }),
        ).rejects.toThrow(INVALID_RESET_TOKEN);
        const tokens = await jwtAuthStrategyService.signIn({ email, password });
        expect(tokens.accessToken.length).toBeGreaterThan(0);
      });

      it('should reject an unknown token with the same error as a used one', async () => {
        await expect(
          jwtAuthStrategyService.resetPassword({
            token: 'not-a-real-token',
            newPassword: 'battery staple',
          }),
        ).rejects.toThrow(INVALID_RESET_TOKEN);
      });

      it('should let only one of two concurrent resets with the same token win', async () => {
        const token = await jwtAuthStrategyService.restorePassword({ email });

        const results = await Promise.allSettled([
          jwtAuthStrategyService.resetPassword({
            token: token ?? '',
            newPassword: 'first winner',
          }),
          jwtAuthStrategyService.resetPassword({
            token: token ?? '',
            newPassword: 'second winner',
          }),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      });

      it('should give an OTP-only account its first password', async () => {
        const otpEmail = `first.password.${email}`;
        await prismaService.account.create({
          data: {
            lastLoginAt: new Date(),
            AccountProfile: { create: { email: otpEmail } },
          },
        });
        const token = await jwtAuthStrategyService.restorePassword({
          email: otpEmail,
        });

        await jwtAuthStrategyService.resetPassword({
          token: token ?? '',
          newPassword: 'battery staple',
        });

        const tokens = await jwtAuthStrategyService.signIn({
          email: otpEmail,
          password: 'battery staple',
        });
        expect(tokens.accessToken.length).toBeGreaterThan(0);
      });
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
