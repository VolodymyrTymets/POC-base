import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
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
import { RestorePasswordInput } from '../../dto/restore-password.input';
import { ResetPasswordInput } from '../../dto/reset-password.input';
import { NotifierService } from '../../../notifier/notifier.service';
import { NotifierTypes } from '../../../notifier/notifier.service.interface';
import { AuthTokensEntity } from '../../entities/auth-tokens.entity';
import {
  EMAIL_ALREADY_REGISTERED,
  INVALID_CREDENTIALS,
  INVALID_RESET_TOKEN,
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
    private readonly notifierService: NotifierService,
  ) {
    super(prismaService, jwtService, configService);
  }

  private readonly RESET_TOKEN_TTL_MINUTES = 30;

  // The reset token is 256 random bits, so a fast hash is enough to keep it
  // unusable from a database dump; bcrypt's cost would only slow the lookup.
  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
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

  // Returns the token when one was issued, null for an unknown email. The
  // caller must answer both the same way so the endpoint cannot be used to
  // find out which emails are registered.
  async restorePassword(
    restorePasswordInput: RestorePasswordInput,
  ): Promise<string | null> {
    const profile = await this.prismaService.accountProfile.findFirst({
      where: {
        email: normalizeEmail(restorePasswordInput.email),
        deleted: false,
        Account: { deleted: false },
      },
      select: { Account: true },
    });
    if (!profile) {
      return null;
    }

    const token = randomBytes(32).toString('hex');
    const resetTokenHash = this.hashResetToken(token);
    const resetTokenExpiresAt = new Date(
      Date.now() + this.RESET_TOKEN_TTL_MINUTES * 60 * 1000,
    );
    // Overwriting replaces any token still live, and an OTP-only account has
    // no identity row yet, so this is an upsert.
    await this.prismaService.accountIdentity.upsert({
      where: { accountId: profile.Account.id },
      create: {
        accountId: profile.Account.id,
        resetTokenHash,
        resetTokenExpiresAt,
      },
      update: { resetTokenHash, resetTokenExpiresAt },
    });

    await this.notifierService.notifyAboutPasswordReset(
      profile.Account,
      token,
      [NotifierTypes.EMAIL],
    );
    return token;
  }

  async resetPassword(resetPasswordInput: ResetPasswordInput): Promise<void> {
    const resetTokenHash = this.hashResetToken(resetPasswordInput.token);
    const identity = await this.prismaService.accountIdentity.findFirst({
      where: {
        resetTokenHash,
        deleted: false,
        Account: { deleted: false },
      },
    });
    // Unknown, already used and expired tokens are indistinguishable on purpose.
    if (
      !identity?.resetTokenExpiresAt ||
      identity.resetTokenExpiresAt < new Date()
    ) {
      throw new UnauthorizedException(INVALID_RESET_TOKEN);
    }

    const { hash, salt } = await this.hashPassword(
      resetPasswordInput.newPassword,
    );
    // Conditional on the token still being there: of two concurrent resets
    // with the same token, only the one that clears it changes the password.
    const consumed = await this.prismaService.accountIdentity.updateMany({
      where: { id: identity.id, resetTokenHash },
      data: {
        hash,
        salt,
        refreshToken: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException(INVALID_RESET_TOKEN);
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
