import { Info } from '@nestjs/graphql';
import { Inject, Injectable } from '@nestjs/common';
import { type GraphQLResolveInfo } from 'graphql/type';
import { PrismaService } from '../prisma/prisma.service';
import { PRISMA_FACTORY } from '../prisma/prisma.const';
import type { IPrismaFactory } from '../prisma/prisma.caching.service';
import { PrismaCashingService } from '../common/prismacashing.service';
import { getPrismaIncludeFromGqInfo } from '../common/GraphToPrisma';
import { AccountRoleService } from '../account-role/account-role.service';
import { AccountRoleType } from '../../generated/prisma/enums';

@Injectable()
export class AccountService extends PrismaCashingService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly accountRoleService: AccountRoleService,
    @Inject(PRISMA_FACTORY) protected prismaFactory: IPrismaFactory,
  ) {
    super(prismaFactory);
  }

  async getAccountById(id: string, @Info() info?: GraphQLResolveInfo) {
    return this.getPrismaService(
      this.infoToPrismaCashingConfig(info),
    ).account.findFirst({
      where: { id },
      select: getPrismaIncludeFromGqInfo(info),
    });
  }

  async getAccountByPhoneNumber(
    phoneNumber: string,
    @Info() info?: GraphQLResolveInfo,
  ) {
    return this.getPrismaService(
      this.infoToPrismaCashingConfig(info),
    ).account.findFirst({
      where: {
        AccountProfile: { phoneNumber },
      },
      select: getPrismaIncludeFromGqInfo(info),
    });
  }

  async createCustomerAccount(phoneNumber: string) {
    const account = await this.prismaService.account.create({
      data: {
        lastLoginAt: new Date(),
        AccountProfile: {
          create: {
            phoneNumber,
          },
        },
      },
    });

    await this.accountRoleService.addAccountToRole(
      account.id,
      AccountRoleType.CUSTOMER,
    );

    return account;
  }
}
