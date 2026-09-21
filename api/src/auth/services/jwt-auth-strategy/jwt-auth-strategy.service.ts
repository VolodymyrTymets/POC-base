import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { compare, genSalt, hash as bcryptHash, hashSync } from 'bcrypt';
import { JwtStrategyService } from '../jwt-strategy/jwt-strategy.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../../generated/prisma/client';
import { AccountService } from '../../../account/account.service';
import { SignUpInput } from '../../dto/sign-up.input';
import { PasswordSignInInput } from '../../dto/password-sign-in.input';
import { ChangePasswordInput } from '../../dto/change-password.input';
import { AuthTokensEntity } from '../../entities/auth-tokens.entity';
import {
  EMAIL_ALREADY_REGISTERED,
  INVALID_CREDENTIALS,
} from '../../../common/errors';
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

  // Compared against when no real hash exists, so an unknown email costs the
  // same bcrypt work as a wrong password and response time does not reveal it.
  private readonly timingDummyHash = hashSync(
    randomBytes(16).toString('hex'),
    this.BCRYPT_ROUNDS,
  );

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

  async signIn(signInInput: PasswordSignInInput): Promise<AuthTokensEntity> {
    const profile = await this.prismaService.accountProfile.findFirst({
      where: {
        email: normalizeEmail(signInInput.email),
        deleted: false,
        Account: { deleted: false },
      },
      select: {
        accountId: true,
        Account: { select: { AccountIdentity: true } },
      },
    });
    const identity = profile?.Account.AccountIdentity;
    // OTP-only accounts have no hash; they fail like any other bad credential.
    const hash = identity && !identity.deleted ? identity.hash : null;

    const passwordMatches = await compare(
      signInInput.password,
      hash ?? this.timingDummyHash,
    );
    if (!profile || !hash || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.refreshTokens(profile.accountId);
  }

  async changePassword(
    accountId: string,
    changePasswordInput: ChangePasswordInput,
  ): Promise<void> {
    const identity = await this.prismaService.accountIdentity.findFirst({
      where: { accountId, deleted: false },
    });

    // An OTP-only account has no hash yet; it sets a first password through
    // restorePassword, so here it fails like any other wrong password.
    const passwordMatches = await compare(
      changePasswordInput.currentPassword,
      identity?.hash ?? this.timingDummyHash,
    );
    if (!identity?.hash || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const { hash, salt } = await this.hashPassword(
      changePasswordInput.newPassword,
    );
    // One update: the new hash lands together with the revocation of every
    // credential issued under the old password (sessions and a pending reset).
    await this.prismaService.accountIdentity.update({
      where: { accountId },
      data: {
        hash,
        salt,
        refreshToken: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
    });
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
