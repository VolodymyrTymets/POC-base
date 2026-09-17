import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { OtpAuthStrategyService } from './otp-auth-strategy.service';
import { OtpCodeGeneratorService } from './otp-code-generator/otp-code-generator.service';
import { NotifierModule } from '../../../notifier/notifier.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { DataCooker } from '../../../../test/utils/DataCooker/DataCooker';
import { PrismaAdapterMockFactory } from '../../../../test/utils/mock-services/prisma.adapter.factory';
import { AccountService } from '../../../account/account.service';
import { AccountProfileService } from '../../../account-profile/account-profile.service';
import { NotifierService } from '../../../notifier/notifier.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaAdapterFactory } from '../../../prisma/prisma.adapter.factory';
import { JwtStrategy } from '../../strategies/jwt.strategy';
import { GqlAuthGuard } from '../../guards/gql-auth.guard';
import { AccountRoleModule } from '../../../account-role/account-role.module';
import { FileAssertService } from '../../../files/services/file-assert.service';

describe('OtpAuthStrategyService', () => {
  let otpAuthStrategyService: OtpAuthStrategyService;
  let prismaService: PrismaService;
  let notifierService: NotifierService;
  const dataCooker = new DataCooker();

  const testPhoneNumber = '+1234567890';
  const testPhoneNumber2 = '+9876543210';

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
        NotifierModule,
        PassportModule,
        AccountRoleModule,
        JwtModule.register({
          secret: 'test-jwt-secret',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        OtpAuthStrategyService,
        OtpCodeGeneratorService,
        AccountService,
        AccountProfileService,
        FileAssertService,
        JwtStrategy,
        GqlAuthGuard,
      ],
    })
      .overrideProvider(PrismaAdapterFactory)
      .useValue(new PrismaAdapterMockFactory(dataCooker.getPgLitle()))
      .compile();

    otpAuthStrategyService = app.get<OtpAuthStrategyService>(
      OtpAuthStrategyService,
    );
    prismaService = app.get<PrismaService>(PrismaService);
    notifierService = app.get<NotifierService>(NotifierService);
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });

  it('should be defined', () => {
    expect(otpAuthStrategyService).toBeDefined();
  });

  describe('signIn', () => {
    it('should create account and generate OTP for new phone number', async () => {
      jest
        .spyOn(notifierService, 'notifyAboutTOTPCode')
        .mockResolvedValue(undefined);

      const result = await otpAuthStrategyService.signIn({
        phoneNumber: testPhoneNumber,
      });

      expect(result).toBeDefined();

      const account = await prismaService.account.findFirst({
        where: { AccountProfile: { phoneNumber: testPhoneNumber } },
        include: { AccountIdentity: true },
      });

      expect(account).toBeDefined();
      expect(account.AccountIdentity).toBeDefined();
      expect(account.AccountIdentity.otpHash).toBeDefined();
      expect(account.AccountIdentity.otpExpiresAt).toBeDefined();
    });

    it('should not create duplicate account for existing phone number', async () => {
      jest
        .spyOn(notifierService, 'notifyAboutTOTPCode')
        .mockResolvedValue(undefined);

      await otpAuthStrategyService.signIn({
        phoneNumber: testPhoneNumber2,
      });

      const accountsBefore = await prismaService.account.count({
        where: { AccountProfile: { phoneNumber: testPhoneNumber2 } },
      });

      await otpAuthStrategyService.signIn({
        phoneNumber: testPhoneNumber2,
      });

      const accountsAfter = await prismaService.account.count({
        where: { AccountProfile: { phoneNumber: testPhoneNumber2 } },
      });

      expect(accountsBefore).toBe(1);
      expect(accountsAfter).toBe(1);
    });

    it('should update OTP hash on subsequent signIn', async () => {
      jest
        .spyOn(notifierService, 'notifyAboutTOTPCode')
        .mockResolvedValue(undefined);

      await otpAuthStrategyService.signIn({
        phoneNumber: testPhoneNumber,
      });

      const firstOtp = await prismaService.accountIdentity.findFirst({
        where: {
          Account: { AccountProfile: { phoneNumber: testPhoneNumber } },
        },
      });

      const firstHash = firstOtp.otpHash;

      await new Promise((resolve) => setTimeout(resolve, 10));

      await otpAuthStrategyService.signIn({
        phoneNumber: testPhoneNumber,
      });

      const secondOtp = await prismaService.accountIdentity.findFirst({
        where: {
          Account: { AccountProfile: { phoneNumber: testPhoneNumber } },
        },
      });

      expect(firstHash).not.toBe(secondOtp.otpHash);
    });

    it('should set OTP expiration to 2 minutes from now', async () => {
      jest
        .spyOn(notifierService, 'notifyAboutTOTPCode')
        .mockResolvedValue(undefined);

      const beforeTime = Date.now();
      await otpAuthStrategyService.signIn({
        phoneNumber: testPhoneNumber,
      });
      const afterTime = Date.now();

      const accountIdentity = await prismaService.accountIdentity.findFirst({
        where: {
          Account: { AccountProfile: { phoneNumber: testPhoneNumber } },
        },
      });

      const expiresAt = accountIdentity.otpExpiresAt.getTime();
      const expectedTime = beforeTime + 2 * 60 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(
        beforeTime + 2 * 60 * 1000 - 100,
      );
      expect(expiresAt).toBeLessThanOrEqual(afterTime + 2 * 60 * 1000 + 100);
    });

    it('should call notifier to send OTP', async () => {
      const notifySpy = jest
        .spyOn(notifierService, 'notifyAboutTOTPCode')
        .mockResolvedValue(undefined);

      await otpAuthStrategyService.signIn({
        phoneNumber: testPhoneNumber,
      });

      expect(notifySpy).toHaveBeenCalled();
      const callArgs = notifySpy.mock.calls[0];
      expect(callArgs[0]).toBeDefined();
      expect(callArgs[1]).toBeDefined();
    });
  });

  describe('verifyOtp', () => {
    beforeEach(async () => {
      jest
        .spyOn(notifierService, 'notifyAboutTOTPCode')
        .mockResolvedValue(undefined);
    });

    it('should verify valid OTP and return access and refresh tokens', async () => {
      const phoneNumber = '+1111111111';
      await otpAuthStrategyService.signIn({ phoneNumber });

      const identity = await prismaService.accountIdentity.findFirst({
        where: { Account: { AccountProfile: { phoneNumber } } },
      });

      const otpCodeGenerator = new OtpCodeGeneratorService();
      const code = otpCodeGenerator.generateCode();
      const { hash } = await otpCodeGenerator.hashCode(code);

      await prismaService.accountIdentity.update({
        where: { accountId: identity.accountId },
        data: { otpHash: hash },
      });

      const result = await otpAuthStrategyService.verifyOtp({
        phoneNumber,
        code,
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('should throw UnauthorizedException when account not found', async () => {
      const nonExistentPhone = '+9999999999';

      await expect(
        otpAuthStrategyService.verifyOtp({
          phoneNumber: nonExistentPhone,
          code: '123456',
        }),
      ).rejects.toThrow(new UnauthorizedException('Account not found'));
    });

    it('should throw UnauthorizedException when AccountIdentity not found', async () => {
      const phoneNumber = '+2222222222';
      await otpAuthStrategyService.signIn({ phoneNumber });

      const account = await prismaService.account.findFirst({
        where: { AccountProfile: { phoneNumber } },
        include: { AccountIdentity: true },
      });

      await prismaService.accountIdentity.delete({
        where: { accountId: account.id },
      });

      await expect(
        otpAuthStrategyService.verifyOtp({
          phoneNumber,
          code: '123456',
        }),
      ).rejects.toThrow(new UnauthorizedException('Account not found'));
    });

    it('should throw UnauthorizedException when OTP is expired', async () => {
      const phoneNumber = '+3333333333';
      await otpAuthStrategyService.signIn({ phoneNumber });

      const account = await prismaService.account.findFirst({
        where: { AccountProfile: { phoneNumber } },
      });

      const expiredTime = new Date(Date.now() - 60000);
      await prismaService.accountIdentity.update({
        where: { accountId: account.id },
        data: { otpExpiresAt: expiredTime },
      });

      await expect(
        otpAuthStrategyService.verifyOtp({
          phoneNumber,
          code: '123456',
        }),
      ).rejects.toThrow(new UnauthorizedException('Code expired'));
    });

    it('should throw UnauthorizedException when otpHash is null', async () => {
      const phoneNumber = '+4444444444';
      await otpAuthStrategyService.signIn({ phoneNumber });

      const account = await prismaService.account.findFirst({
        where: { AccountProfile: { phoneNumber } },
      });

      await prismaService.accountIdentity.update({
        where: { accountId: account.id },
        data: { otpHash: null },
      });

      await expect(
        otpAuthStrategyService.verifyOtp({
          phoneNumber,
          code: '123456',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid code'));
    });

    it('should throw UnauthorizedException when OTP code is invalid', async () => {
      const phoneNumber = '+5555555555';
      await otpAuthStrategyService.signIn({ phoneNumber });

      await expect(
        otpAuthStrategyService.verifyOtp({
          phoneNumber,
          code: '000000',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid code'));
    });

    it('should clear OTP hash and expiration after successful verification', async () => {
      const phoneNumber = '+6666666666';
      await otpAuthStrategyService.signIn({ phoneNumber });

      const identity = await prismaService.accountIdentity.findFirst({
        where: { Account: { AccountProfile: { phoneNumber } } },
      });

      const otpCodeGenerator = new OtpCodeGeneratorService();
      const code = otpCodeGenerator.generateCode();
      const { hash } = await otpCodeGenerator.hashCode(code);

      await prismaService.accountIdentity.update({
        where: { accountId: identity.accountId },
        data: { otpHash: hash },
      });

      await otpAuthStrategyService.verifyOtp({
        phoneNumber,
        code,
      });

      const updatedIdentity = await prismaService.accountIdentity.findFirst({
        where: { accountId: identity.accountId },
      });

      expect(updatedIdentity.otpHash).toBeNull();
      expect(updatedIdentity.otpExpiresAt).toBeNull();
    });

    it('should store hashed refresh token in database', async () => {
      const phoneNumber = '+7777777777';
      await otpAuthStrategyService.signIn({ phoneNumber });

      const identity = await prismaService.accountIdentity.findFirst({
        where: { Account: { AccountProfile: { phoneNumber } } },
      });

      const otpCodeGenerator = new OtpCodeGeneratorService();
      const code = otpCodeGenerator.generateCode();
      const { hash } = await otpCodeGenerator.hashCode(code);

      await prismaService.accountIdentity.update({
        where: { accountId: identity.accountId },
        data: { otpHash: hash },
      });

      await otpAuthStrategyService.verifyOtp({
        phoneNumber,
        code,
      });

      const updatedIdentity = await prismaService.accountIdentity.findFirst({
        where: { accountId: identity.accountId },
      });

      expect(updatedIdentity.refreshToken).toBeDefined();
      expect(typeof updatedIdentity.refreshToken).toBe('string');
      expect(updatedIdentity.refreshToken.length).toBeGreaterThan(20);
    });

    it('should generate different refresh tokens for different verifications', async () => {
      const phoneNumber = '+8888888888';
      await otpAuthStrategyService.signIn({ phoneNumber });

      const account = await prismaService.account.findFirst({
        where: { AccountProfile: { phoneNumber } },
      });
      const accountId = account.id;

      const otpCodeGenerator = new OtpCodeGeneratorService();
      const code1 = otpCodeGenerator.generateCode();
      const { hash: hash1 } = await otpCodeGenerator.hashCode(code1);

      await prismaService.accountIdentity.update({
        where: { accountId },
        data: { otpHash: hash1 },
      });

      const result1 = await otpAuthStrategyService.verifyOtp({
        phoneNumber,
        code: code1,
      });

      const tokens1 = await prismaService.accountIdentity.findFirst({
        where: { accountId },
      });

      await otpAuthStrategyService.signIn({ phoneNumber });

      const code2 = otpCodeGenerator.generateCode();
      const { hash: hash2 } = await otpCodeGenerator.hashCode(code2);

      await prismaService.accountIdentity.update({
        where: { accountId },
        data: { otpHash: hash2 },
      });

      const result2 = await otpAuthStrategyService.verifyOtp({
        phoneNumber,
        code: code2,
      });

      const tokens2 = await prismaService.accountIdentity.findFirst({
        where: { accountId: accountId },
      });
      expect(result1.refreshToken).not.toBe(result2.refreshToken);
      expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
    });
  });
});
