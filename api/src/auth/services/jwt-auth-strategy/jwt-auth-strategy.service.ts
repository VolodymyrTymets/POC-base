import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, genSalt, hash as bcryptHash } from 'bcrypt';
import { JwtStrategyService } from '../jwt-strategy/jwt-strategy.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../../generated/prisma/client';
import { AccountService } from '../../../account/account.service';
import { SignUpInput } from '../../dto/sign-up.input';
import { AuthTokensEntity } from '../../entities/auth-tokens.entity';
import { EMAIL_ALREADY_REGISTERED } from '../../../common/errors';
import { normalizeEmail } from '../../../common/normalize-email';

const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class JwtAuthStrategyService extends JwtStrategyService {
  constructor(
    protected readonly prismaService: PrismaService,
    protected readonly jwtService: JwtService,
    protected readonly configService: ConfigService,
    private readonly accountService: AccountService,
  ) {
    super(prismaService, jwtService, configService);
  }

  private async hashPassword(password: string) {
    const salt = await genSalt(this.BCRYPT_ROUNDS);
    const hash = await bcryptHash(password, salt);
    return { hash, salt };
  }

  async signUp(signUpInput: SignUpInput): Promise<AuthTokensEntity> {
    const email = normalizeEmail(signUpInput.email);

    // Soft-deleted profiles keep their email reserved: @unique spans every row.
    const existing = await this.prismaService.accountProfile.findFirst({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(EMAIL_ALREADY_REGISTERED);
    }

    const { hash, salt } = await this.hashPassword(signUpInput.password);

    try {
      const account = await this.accountService.createPasswordAccount(
        email,
        hash,
        salt,
      );
      return await this.refreshTokens(account.id);
    } catch (error) {
      // Two concurrent sign-ups can both pass the pre-check above; the @unique
      // index is what actually decides, so map its violation to the same error.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_VIOLATION
      ) {
        throw new ConflictException(EMAIL_ALREADY_REGISTERED);
      }
      throw error;
    }
  }

  async validateRefreshToken(accountId: string, refreshToken: string) {
    try {
      const identity =
        await this.prismaService.accountIdentity.findFirstOrThrow({
          where: { accountId },
        });
      if (!identity || !identity.refreshToken) {
        throw new UnauthorizedException();
      }
      const refreshTokenMatches = await compare(
        refreshToken,
        identity.refreshToken,
      );
      if (!refreshTokenMatches) {
        throw new UnauthorizedException();
      }
      return { accountId };
    } catch (error) {
      Logger.error('Verify user refresh token error', error);
      throw new UnauthorizedException();
    }
  }

  refreshToken(accountId: string) {
    return this.refreshTokens(accountId);
  }
}
