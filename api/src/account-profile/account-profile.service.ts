import { Inject, Injectable } from '@nestjs/common';
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
    await this.updateEntityAndClearCache<
      AccountProfileUpdateArgs,
      AccountProfileModel
    >(
      'accountProfile',
      {
        where: {
          accountId,
        },
        data: input,
      },
      {
        collection: ['AccountProfile', 'Account'],
      },
    );

    return this.getAccountProfileById(accountId, info);
  }
}
