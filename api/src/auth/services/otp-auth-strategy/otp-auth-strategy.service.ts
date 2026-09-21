import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { NotifierService } from '../../../notifier/notifier.service';
import { NotifierTypes } from '../../../notifier/notifier.service.interface';
import { OtpCodeGeneratorService } from './otp-code-generator/otp-code-generator.service';
import { AccountService } from '../../../account/account.service';
import { SignInInput } from '../../dto/sign-in.input';
import { VerifyOtpInput } from '../../dto/verify-otp.input';
import { AuthTokensEntity } from '../../entities/auth-tokens.entity';
import { JwtStrategyService } from '../jwt-strategy/jwt-strategy.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OtpAuthStrategyService extends JwtStrategyService {
  constructor(
    private readonly notifierService: NotifierService,
    private readonly accountService: AccountService,
    private readonly otpCodeGeneratorService: OtpCodeGeneratorService,
    protected readonly prismaService: PrismaService,
    protected readonly jwtService: JwtService,
    protected readonly configService: ConfigService,
  ) {
    super(prismaService, jwtService, configService);
  }

  private readonly OTP_TTL_MINUTES = 2;

  async signIn(signInInput: SignInInput): Promise<string> {
    let account = await this.accountService.getAccountByPhoneNumber(
      signInInput.phoneNumber,
    );
    if (!account) {
      account = await this.accountService.createCustomerAccount(
        signInInput.phoneNumber,
      );
    }

    const code = this.otpCodeGeneratorService.generateCode();
    const { hash: otpHash, salt: otpSalt } =
      await this.otpCodeGeneratorService.hashCode(code);
    const otpExpiresAt = new Date(
      Date.now() + this.OTP_TTL_MINUTES * 60 * 1000,
    );

    await this.prismaService.accountIdentity.upsert({
      where: { accountId: account.id },
      create: {
        accountId: account.id,
        otpHash,
        otpSalt,
        otpExpiresAt,
      },
      update: {
        otpHash,
        otpExpiresAt,
      },
    });

    await this.notifierService.notifyAboutTOTPCode(account, code, [
      NotifierTypes.SMS,
    ]);
    return code;
  }

  async verifyOtp(verifyOtpInput: VerifyOtpInput): Promise<AuthTokensEntity> {
    const { phoneNumber, code } = verifyOtpInput;

    const account = await this.prismaService.account.findFirst({
      where: {
        AccountProfile: { phoneNumber },
      },
      include: {
        AccountIdentity: true,
      },
    });

    if (!account || !account.AccountIdentity) {
      throw new UnauthorizedException('Account not found');
    }

    const identity = account.AccountIdentity;

    if (!identity.otpExpiresAt || identity.otpExpiresAt < new Date()) {
      throw new UnauthorizedException('Code expired');
    }

    if (!identity.otpHash) {
      throw new UnauthorizedException('Invalid code');
    }

    const isValid = await this.otpCodeGeneratorService.verifyCode(
      code,
      identity.otpHash,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid code');
    }

    // Clear OTP fields
    await this.prismaService.accountIdentity.update({
      where: { accountId: account.id },
      data: {
        otpHash: null,
        otpSalt: null,
        otpExpiresAt: null,
      },
    });

    // Verifying an OTP is what proves control of the phone; token issuance is
    // shared with password sign-in, which proves nothing about the phone.
    await this.prismaService.accountProfile.update({
      where: { accountId: account.id },
      data: { isPhoneVerified: true },
    });

    return this.refreshTokens(account.id);
  }
}
