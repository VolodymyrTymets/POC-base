import { PrismaPg } from '@prisma/adapter-pg';
import type { SqlMigrationAwareDriverAdapterFactory } from '@prisma/driver-adapter-utils';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PrismaAdapterFactory {
  create(): SqlMigrationAwareDriverAdapterFactory {
    Logger.log('[PrismaAdapterFactory] Using PrismaPg adapter');
    return new PrismaPg(process.env.DATABASE_URL as string);
  }
}
