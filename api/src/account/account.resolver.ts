import { Query, Info, Resolver, ResolveField, Parent } from '@nestjs/graphql';
import { type GraphQLResolveInfo } from 'graphql/type';
import { UnauthorizedException, UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AccountEntity } from './entities/account.entity';
import { AccountService } from './account.service';
import { CurrentAccount } from '../decorators/current-account.decorator';
import { type AuthAccount } from '../auth/strategies/jwt.strategy';
import { AccountProfileEntity } from '../account-profile/entities/account-profile.entity';
import { AccountProfileService } from '../account-profile/account-profile.service';
import { NOT_FOUND } from '../common/errors';

@Resolver(AccountEntity)
export class AccountResolver {
  constructor(
    private accountService: AccountService,
    private readonly accountProfileService: AccountProfileService,
  ) {}

  @Query(() => AccountEntity, {
    description: 'Get current account',
  })
  @UseGuards(GqlAuthGuard)
  async account(
    @CurrentAccount() currentAccount: AuthAccount,
    @Info() info?: GraphQLResolveInfo,
  ): Promise<AccountEntity> {
    const accountId = currentAccount.accountId;
    const account = await this.accountService.getAccountById(accountId, info);
    if (!account) {
      throw new UnauthorizedException(NOT_FOUND);
    }
    return account;
  }

  @ResolveField(() => AccountProfileEntity)
  AccountProfile(
    @Parent()
    account: AccountEntity & { accountProfile?: AccountProfileEntity },
    @Info() info?: GraphQLResolveInfo,
  ): AccountProfileEntity {
    if (!account.AccountProfile) {
      return this.accountProfileService.getAccountProfileById(
        account.id,
        info,
      ) as unknown as AccountProfileEntity;
    }
    return account.AccountProfile;
  }
}
