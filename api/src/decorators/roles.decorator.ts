import { SetMetadata } from '@nestjs/common';
import { AccountRoleType } from '../../generated/prisma/enums';

export const Roles = (...args: AccountRoleType[]) => SetMetadata('roles', args);
