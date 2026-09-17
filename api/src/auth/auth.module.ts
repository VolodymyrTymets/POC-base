import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import { AuthResolver } from './auth.resolver';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GqlAuthGuard } from './guards/gql-auth.guard';

import { PrismaModule } from '../prisma/prisma.module';
import { NotifierModule } from '../notifier/notifier.module';
import { AccountService } from '../account/account.service';
import { JwtAuthStrategyService } from './services/jwt-auth-strategy/jwt-auth-strategy.service';
import { OtpAuthStrategyService } from './services/otp-auth-strategy/otp-auth-strategy.service';
import { OtpCodeGeneratorService } from './services/otp-auth-strategy/otp-code-generator/otp-code-generator.service';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { AuthService } from './auth.service';
import { RoleGuard } from './guards/role.guard';
import { AccountRoleModule } from '../account-role/account-role.module';

@Global()
@Module({
  imports: [
    PrismaModule,
    NotifierModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn:
            configService.get<StringValue>('JWT_ACCESS_TOKEN_EXPIRES_IN') ||
            '15m',
        },
      }),
    }),
    AccountRoleModule,
  ],
  providers: [
    AuthResolver,
    AccountService,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtRefreshAuthGuard,
    GqlAuthGuard,
    RoleGuard,
    JwtAuthStrategyService,
    OtpAuthStrategyService,
    OtpCodeGeneratorService,
    AuthService,
  ],
  exports: [JwtModule, GqlAuthGuard],
})
export class AuthModule {}
