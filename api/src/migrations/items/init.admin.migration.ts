import * as Sentry from '@sentry/nestjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountRoleType } from 'generated/prisma/enums';
import { IMigrationItem } from './migration-item.interface';
import { Logger } from '@nestjs/common';
import { AccountProfileService } from '../../account-profile/account-profile.service';
import admins from '../../assets/admins';
import { AccountRoleService } from '../../account-role/account-role.service';

export class InitAdminMigration implements IMigrationItem {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountProfileService: AccountProfileService,
    private readonly accountRoleService: AccountRoleService,
  ) {}
  public name = 'init.admin.migration';

  private log(message: string) {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    Logger.log(`[init.admin.migration] ${message}`);
  }

  async inNeedToRun() {
    return (
      (await this.prisma.account.count({
        where: {
          AccountOnRole: {
            some: {
              roleId: AccountRoleType.ADMIN,
            },
          },
        },
      })) === 0
    );
  }

  async run() {
    try {
      for (const adminsInput of admins) {
        const account = await this.prisma.account.create({
          data: {
            lastLoginAt: new Date(),
            AccountProfile: {
              create: {
                phoneNumber: adminsInput.phoneNumber,
              },
            },
          },
        });

        await this.accountRoleService.addAccountToRole(
          account.id,
          AccountRoleType.ADMIN,
        );
        await this.accountProfileService.updateAccountProfile(account.id, {
          firstName: adminsInput.firstName,
          lastName: adminsInput.lastName,
        });

        this.log(`Admin ${adminsInput.phoneNumber} is added`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message || '' : 'Unknown error';
      Sentry.captureException(this.name + message);
      throw new Error(this.name + message);
    }
  }
}
