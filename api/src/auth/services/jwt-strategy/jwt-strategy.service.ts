import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import { PrismaService } from '../../../prisma/prisma.service';

export class JwtStrategyService {
  constructor(
    protected readonly prismaService: PrismaService,
    protected readonly jwtService: JwtService,
    protected readonly configService: ConfigService,
  ) {}
  private readonly BCRYPT_ROUNDS = 10;

  async refreshTokens(accountId: string) {
    const payload = {
      sub: accountId,
      jti: crypto.randomBytes(4).toString('hex'),
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_TOKEN_SECRET'),
      expiresIn:
        this.configService.get<StringValue>('JWT_ACCESS_TOKEN_EXPIRES_IN') ||
        '15m',
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_REFRESH_TOKEN_SECRET'),
      expiresIn:
        this.configService.get<StringValue>('JWT_REFRESH_TOKEN_EXPIRES_IN') ||
        '7d',
    });

    // Hash and store refresh token
    const hashedRefreshToken = await bcrypt.hash(
      refreshToken,
      this.BCRYPT_ROUNDS,
    );
    await this.prismaService.accountIdentity.update({
      where: { accountId },
      data: { refreshToken: hashedRefreshToken },
    });

    await this.prismaService.accountProfile.update({
      where: { accountId },
      data: { isPhoneVerified: true },
    });

    return { accessToken, refreshToken };
  }
}
