import * as Sentry from '@sentry/nestjs';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountRoleType } from 'generated/prisma/enums';
import { IMigrationItem } from './migration-item.interface';

export class InitRolesMigration implements IMigrationItem {
  constructor(private readonly prisma: PrismaService) {}

  public name = 'init.roles.migration';

  private log(message: string) {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    Logger.log(`[init.roles.migration] ${message}`);
  }

  async inNeedToRun() {
    return (await this.prisma.accountRole.count()) === 0;
  }

  async run() {
    try {
      for (const role of Object.values(AccountRoleType)) {
        await this.prisma.accountRole.create({
          data: {
            type: role,
          },
        });

        this.log(`User role ${role} is added`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message || '' : 'Unknown error';
      Sentry.captureException(this.name + message);
      throw new Error(this.name + message);
    }
  }
}
