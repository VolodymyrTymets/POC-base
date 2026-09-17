import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PRISMA_FACTORY } from '../prisma/prisma.const';
import type { IPrismaFactory } from '../prisma/prisma.caching.service';
import { PrismaCashingService } from '../common/prismacashing.service';
import { GraphQLResolveInfo } from 'graphql/type';
import { AccountRoleType } from '../../generated/prisma/enums';

@Injectable()
export class AccountRoleService extends PrismaCashingService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(PRISMA_FACTORY) protected prismaFactory: IPrismaFactory,
  ) {
    super(prismaFactory);
  }
  async getAccountRoles(accountId: string, info?: GraphQLResolveInfo) {
    const roles = await this.getPrismaService(
      this.infoToPrismaCashingConfig(info),
    ).accountRole.findMany({
      where: {
        AccountOnRole: {
          some: {
            accountId,
          },
        },
      },
      select: {
        type: true,
      },
    });
    return roles.map((r) => r.type);
  }

  async addAccountToRole(
    accountId: string,
    accountRoleType: AccountRoleType,
    info?: GraphQLResolveInfo,
  ) {
    const prisma = this.getPrismaService(this.infoToPrismaCashingConfig(info));

    const accountRole = await prisma.accountRole.findUnique({
      where: {
        type: accountRoleType,
      },
    });
    if (!accountRole) {
      throw new Error(`Role ${accountRoleType} not found`);
    }

    return prisma.accountOnRole.create({
      data: {
        accountId,
        roleId: accountRole.id,
      },
    });
  }
}
