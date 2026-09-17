import { Logger } from '@nestjs/common';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import type { SqlMigrationAwareDriverAdapterFactory } from '@prisma/driver-adapter-utils';

export class PrismaAdapterMockFactory {
  constructor(pdlitle: PGlite) {
    this.pdlitle = pdlitle;
  }
  private readonly pdlitle: PGlite;
  create(): SqlMigrationAwareDriverAdapterFactory {
    Logger.log('[PrismaAdapterMockFactory] Using PGlite adapter');
    return new PrismaPGlite(this.pdlitle);
  }
}
