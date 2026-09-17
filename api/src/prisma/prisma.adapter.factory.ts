import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import type { SqlMigrationAwareDriverAdapterFactory } from '@prisma/driver-adapter-utils';

export class PrismaAdapterFactory {
  create(): SqlMigrationAwareDriverAdapterFactory {
    if (process.env.NODE_ENV === 'test') {
      Logger.log('[PrismaAdapterFactory] Using PGlite adapter');

      // we use global.pGlite to avoid creating a new instance every time
      // this only for test environment
      // original instant is created in DataCooker
      return new PrismaPGlite(global.pGlite);
    }
    return new PrismaPg(process.env.DATABASE_URL as string);
  }
}
