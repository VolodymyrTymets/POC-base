import { registerEnumType } from '@nestjs/graphql';
import { AccountRoleType } from 'generated/prisma/enums';

registerEnumType(AccountRoleType, {
  name: 'AccountRoleType',
});
