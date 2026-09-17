import { intersection } from 'lodash';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountRoleType } from '../../../generated/prisma/enums';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AccountRoleService } from '../../account-role/account-role.service';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly accountRoleService: AccountRoleService,
  ) {}

  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext<{ req: Request }>().req;
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.get<AccountRoleType[]>(
      'roles',
      context.getHandler(),
    );
    if (!roles) {
      Logger.error('[RoleGuard] No roles found in context');
      return true;
    }
    const request = this.getRequest(context);
    const user = request['user'] as { accountId: string };
    const accountId = user?.accountId;
    if (!accountId) {
      Logger.error('[RoleGuard] No account id found in request');
      return false;
    }
    const accountRoles = await this.accountRoleService.getAccountRoles(
      accountId,
      // force use prisma caching
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      { operation: { operation: 'query' } },
    );
    const containsAnyRole = intersection(accountRoles, roles).length > 0;
    if (!containsAnyRole) {
      Logger.error('[RoleGuard] No matching role found for account', {
        accountId,
        roles,
      });
      return false;
    }

    return true;
  }
}
