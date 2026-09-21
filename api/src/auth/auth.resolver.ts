import { Mutation, Args, Resolver } from '@nestjs/graphql';
import { SignInInput } from './dto/sign-in.input';
import { VerifyOtpInput } from './dto/verify-otp.input';
import { SignUpInput } from './dto/sign-up.input';
import { PasswordSignInInput } from './dto/password-sign-in.input';
import { ChangePasswordInput } from './dto/change-password.input';
import { RestorePasswordInput } from './dto/restore-password.input';
import { ResetPasswordInput } from './dto/reset-password.input';
import { RestorePasswordEntity } from './entities/restore-password.entity';
import { ConfigService } from '@nestjs/config';
import { AuthTokensEntity } from './entities/auth-tokens.entity';
import { OtpAuthStrategyService } from './services/otp-auth-strategy/otp-auth-strategy.service';
import { JwtAuthStrategyService } from './services/jwt-auth-strategy/jwt-auth-strategy.service';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { CurrentAccount } from '../decorators/current-account.decorator';
import type { AuthAccount } from './strategies/jwt.strategy';
import { SignInOtpEntity } from './entities/sign-in-otp.entity';
import { AuthService } from './auth.service';
import { GqlAuthGuard } from './guards/gql-auth.guard';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly otpAuthStrategyService: OtpAuthStrategyService,
    private readonly jwtAuthStrategyService: JwtAuthStrategyService,
    private readonly configService: ConfigService,
  ) {}

  private isDevelopmentEnvironment() {
    return ['development', 'local', 'test'].includes(
      this.configService.get<string>('NODE_ENV') ?? '',
    );
  }

  @Mutation(() => SignInOtpEntity, {
    description: 'Request a one-time SMS code for a phone number',
  })
  async signInOtp(
    @Args('signInInput') signInInput: SignInInput,
  ): Promise<SignInOtpEntity> {
    const code = await this.otpAuthStrategyService.signIn(signInInput);
    return {
      success: true,
      ...(process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'local' ||
      process.env.NODE_ENV === 'test'
        ? {
            code,
          }
        : {}),
    };
  }

  @Mutation(() => AuthTokensEntity, {
    description: 'Exchange a valid OTP code for access and refresh tokens',
  })
  verifyOtp(
    @Args('verifyOtpInput') verifyOtpInput: VerifyOtpInput,
  ): Promise<AuthTokensEntity> {
    return this.otpAuthStrategyService.verifyOtp(verifyOtpInput);
  }

  @Mutation(() => AuthTokensEntity, {
    description: 'Register a customer account with an email and password',
  })
  signUp(
    @Args('signUpInput') signUpInput: SignUpInput,
  ): Promise<AuthTokensEntity> {
    return this.jwtAuthStrategyService.signUp(signUpInput);
  }

  @Mutation(() => AuthTokensEntity, {
    description: 'Sign in with the email and password of a registered account',
  })
  signIn(
    @Args('signInInput') signInInput: PasswordSignInInput,
  ): Promise<AuthTokensEntity> {
    return this.jwtAuthStrategyService.signIn(signInInput);
  }

  @Mutation(() => AuthTokensEntity, {
    description: 'Refresh access token using a valid refresh token.',
  })
  @UseGuards(JwtRefreshAuthGuard)
  refreshToken(
    @CurrentAccount() currentAccount: AuthAccount,
  ): Promise<AuthTokensEntity> {
    return this.jwtAuthStrategyService.refreshToken(currentAccount.accountId);
  }

  @Mutation(() => RestorePasswordEntity, {
    description:
      'Email a password reset token; the answer is the same for unknown emails',
  })
  async restorePassword(
    @Args('restorePasswordInput') restorePasswordInput: RestorePasswordInput,
  ): Promise<RestorePasswordEntity> {
    const token =
      await this.jwtAuthStrategyService.restorePassword(restorePasswordInput);
    return {
      success: true,
      ...(token && this.isDevelopmentEnvironment() ? { token } : {}),
    };
  }

  @Mutation(() => Boolean, {
    description:
      'Set a new password with a reset token; every session must sign in again afterwards',
  })
  async resetPassword(
    @Args('resetPasswordInput') resetPasswordInput: ResetPasswordInput,
  ) {
    await this.jwtAuthStrategyService.resetPassword(resetPasswordInput);
    return true;
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean, {
    description:
      'Change the password of the signed-in account; every session must sign in again afterwards',
  })
  async changePassword(
    @CurrentAccount() currentAccount: AuthAccount,
    @Args('changePasswordInput') changePasswordInput: ChangePasswordInput,
  ) {
    await this.jwtAuthStrategyService.changePassword(
      currentAccount.accountId,
      changePasswordInput,
    );
    return true;
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean, {})
  async signOut(@CurrentAccount() currentAccount: AuthAccount) {
    await this.authService.signOut(currentAccount.accountId);
    return true;
  }
}
