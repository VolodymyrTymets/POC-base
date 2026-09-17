import { Module, OnModuleInit } from '@nestjs/common';
import { MigrationService } from './migration.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MigrationsService } from './migrations.service';
import { AccountModule } from '../account/account.module';
import { AccountProfileModule } from '../account-profile/account-profile.module';
import { AccountRoleModule } from '../account-role/account-role.module';

@Module({
  imports: [
    PrismaModule,
    AccountModule,
    AccountProfileModule,
    AccountRoleModule,
  ],
  providers: [MigrationService, MigrationsService],
  exports: [MigrationService],
})
export class MigrationsModule implements OnModuleInit {
  constructor(private readonly migrationsService: MigrationsService) {}
  async onModuleInit() {
    await this.migrationsService.runMigrations();
  }
}
