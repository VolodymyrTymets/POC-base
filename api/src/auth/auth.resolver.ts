import { Mutation, Args, Resolver } from '@nestjs/graphql';
import { SignInInput } from './dto/sign-in.input';
import { VerifyOtpInput } from './dto/verify-otp.input';
import { SignUpInput } from './dto/sign-up.input';
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
  ) {}

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
    description: 'Refresh access token using a valid refresh token.',
  })
  @UseGuards(JwtRefreshAuthGuard)
  refreshToken(
    @CurrentAccount() currentAccount: AuthAccount,
  ): Promise<AuthTokensEntity> {
    return this.jwtAuthStrategyService.refreshToken(currentAccount.accountId);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean, {})
  async signOut(@CurrentAccount() currentAccount: AuthAccount) {
    await this.authService.signOut(currentAccount.accountId);
    return true;
  }
}
