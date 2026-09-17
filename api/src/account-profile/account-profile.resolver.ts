import { Mutation, Info, Resolver, Args } from '@nestjs/graphql';
import { type GraphQLResolveInfo } from 'graphql/type';
import { UnauthorizedException, UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentAccount } from '../decorators/current-account.decorator';
import { type AuthAccount } from '../auth/strategies/jwt.strategy';
import { AccountProfileEntity } from './entities/account-profile.entity';
import { AccountProfileService } from './account-profile.service';
import { UpdateAccountProfileInput } from './dto/update-account-profile.input';
import { FORBIDDEN, NOT_FOUND } from '../common/errors';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../decorators/roles.decorator';
import { AccountRoleType } from '../../generated/prisma/enums';

@Resolver(AccountProfileEntity)
export class AccountProfileResolver {
  constructor(private readonly accountProfileService: AccountProfileService) {}

  @Mutation(() => AccountProfileEntity, {
    description: 'Update account profile',
  })
  @UseGuards(RoleGuard)
  @Roles(AccountRoleType.ADMIN, AccountRoleType.CUSTOMER)
  @UseGuards(GqlAuthGuard)
  async updateAccountProfile(
    @Args('accountId', { type: () => String }) accountId: string,
    @Args('accountProfileInput')
    input: UpdateAccountProfileInput,
    @CurrentAccount() currentAccount: AuthAccount,
    @Info() info?: GraphQLResolveInfo,
  ): Promise<AccountProfileEntity> {
    if (currentAccount.accountId !== accountId) {
      throw new UnauthorizedException(FORBIDDEN);
    }

    const isExists =
      await this.accountProfileService.isAccountProfileExists(accountId);
    if (!isExists) {
      throw new UnauthorizedException(NOT_FOUND);
    }

    const account = await this.accountProfileService.updateAccountProfile(
      accountId,
      input,
      info,
    );
    if (!account) {
      throw new UnauthorizedException(NOT_FOUND);
    }
    return account;
  }
}
