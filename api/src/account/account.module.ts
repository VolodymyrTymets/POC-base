import { Module } from '@nestjs/common';
import { AccountService } from './account.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountResolver } from './account.resolver';
import { AccountProfileModule } from '../account-profile/account-profile.module';
import { AccountProfileService } from '../account-profile/account-profile.service';
import { AccountRoleModule } from '../account-role/account-role.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [PrismaModule, AccountProfileModule, AccountRoleModule, FilesModule],
  providers: [AccountService, AccountResolver, AccountProfileService],
  exports: [AccountService],
})
export class AccountModule {}
