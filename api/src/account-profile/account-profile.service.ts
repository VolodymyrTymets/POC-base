import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaCashingService } from '../common/prismacashing.service';
import { PrismaService } from '../prisma/prisma.service';
import { PRISMA_FACTORY } from '../prisma/prisma.const';
import type { IPrismaFactory } from '../prisma/prisma.caching.service';
import type { GraphQLResolveInfo } from 'graphql';
import { UpdateAccountProfileInput } from './dto/update-account-profile.input';
import { getPrismaIncludeFromGqInfo } from '../common/GraphToPrisma';
import {
  AccountProfileUpdateArgs,
  AccountProfileModel,
} from '../../generated/prisma/models/AccountProfile';
import { FileAssertService } from '../files/services/file-assert.service';
import { Prisma } from '../../generated/prisma/client';
import { EMAIL_ALREADY_REGISTERED } from '../common/errors';
import { normalizeEmail } from '../common/normalize-email';

const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class AccountProfileService extends PrismaCashingService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(PRISMA_FACTORY) protected prismaFactory: IPrismaFactory,
    private readonly fileAssertService: FileAssertService,
  ) {
    super(prismaFactory);
  }

  isAccountProfileExists(accountId: string) {
    return this.prismaService.accountProfile.count({
      where: {
        accountId,
      },
    });
  }

  getAccountProfileById(accountId: string, info?: GraphQLResolveInfo) {
    return this.getPrismaService(
      this.infoToPrismaCashingConfig(info),
    ).accountProfile.findFirst({
      where: {
        accountId,
      },
      select: getPrismaIncludeFromGqInfo(info),
    });
  }

  async updateAccountProfile(
    accountId: string,
    input: UpdateAccountProfileInput,
    info?: GraphQLResolveInfo,
  ) {
    const { avatarId } = input;
    if (avatarId) {
      await this.fileAssertService.assertFileAccessByAccount(
        avatarId,
        accountId,
      );
    }
    // Stored the way the auth flows look it up, or the account could never sign in.
    const data =
      input.email === undefined
        ? input
        : { ...input, email: normalizeEmail(input.email) };
    try {
      await this.updateEntityAndClearCache<
        AccountProfileUpdateArgs,
        AccountProfileModel
      >(
        'accountProfile',
        {
          where: {
            accountId,
          },
          data,
        },
        {
          collection: ['AccountProfile', 'Account'],
        },
      );
    } catch (error) {
      // AccountProfile.email is the only unique column this update can hit.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_VIOLATION
      ) {
        throw new ConflictException(EMAIL_ALREADY_REGISTERED);
      }
      throw error;
    }

    return this.getAccountProfileById(accountId, info);
  }
}
