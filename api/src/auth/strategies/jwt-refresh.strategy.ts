import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthAccount, JwtPayload } from './jwt.strategy';

import { JwtAuthStrategyService } from '../services/jwt-auth-strategy/jwt-auth-strategy.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    configService: ConfigService,
    private readonly jwtAuthService: JwtAuthStrategyService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromHeader('x-refresh-token'),
      secretOrKey: configService.getOrThrow('JWT_REFRESH_TOKEN_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: any, payload: JwtPayload): Promise<AuthAccount> {
    const refreshToken = req.get('x-refresh-token');
    if (!refreshToken) {
      throw new UnauthorizedException();
    }

    return this.jwtAuthService.validateRefreshToken(
      payload.sub,
      refreshToken as string,
    );
  }
}
