import * as Sentry from '@sentry/nestjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountRoleType } from 'generated/prisma/enums';
import { IMigrationItem } from '../items/migration-item.interface';
import { Logger } from '@nestjs/common';
import { AccountService } from '../../account/account.service';
import { AccountProfileService } from '../../account-profile/account-profile.service';
import customers from '../../assets/customers';
import { AccountRoleService } from '../../account-role/account-role.service';

export class InitCustomerMigration implements IMigrationItem {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountService: AccountService,
    private readonly accountProfileService: AccountProfileService,
    private readonly accountRoleService: AccountRoleService,
  ) {}
  public name = 'init.customer.migration';

  private log(message: string) {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    Logger.log(`[init.roles.migration] ${message}`);
  }

  async inNeedToRun() {
    return (await this.prisma.customer.count()) === 0;
  }
  async run() {
    try {
      for (const customerInput of customers) {
        const account = await this.accountService.createCustomerAccount(
          customerInput.phoneNumber,
        );
        await this.accountProfileService.updateAccountProfile(account.id, {
          firstName: customerInput.firstName,
          lastName: customerInput.lastName,
          middleName: customerInput.middleName,
          email: customerInput.email,
          dataOfBirth: customerInput.dataOfBirth,
        });
        this.log(`Customer ${customerInput.phoneNumber} is added`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message || '' : 'Unknown error';
      Sentry.captureException(this.name + message);
      throw new Error(this.name + message);
    }
  }
}
