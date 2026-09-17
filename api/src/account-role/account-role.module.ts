import { Module } from '@nestjs/common';
import { AccountRoleService } from './account-role.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AccountRoleService],
  exports: [AccountRoleService],
})
export class AccountRoleModule {}
