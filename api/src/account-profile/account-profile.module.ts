import { Module } from '@nestjs/common';
import { AccountProfileService } from './account-profile.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountProfileResolver } from './account-profile.resolver';
import { AccountRoleModule } from '../account-role/account-role.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [PrismaModule, AccountRoleModule, FilesModule],
  providers: [AccountProfileService, AccountProfileResolver],
  exports: [AccountProfileService],
})
export class AccountProfileModule {}
