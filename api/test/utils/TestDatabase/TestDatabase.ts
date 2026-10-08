import { PGlite } from '@electric-sql/pglite';
import { PrismaClient } from 'generated/prisma/client';
import { ITestDatabase } from './ITestDatabase';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { postgis } from '@electric-sql/pglite-postgis';
import { IMigratedTemplate } from '../MigratedTemplate/IMigratedTemplate';
import { MigratedTemplate } from '../MigratedTemplate/MigratedTemplate';

export class TestDatabase implements ITestDatabase {
  constructor() {}
  private readonly migratedTemplate: IMigratedTemplate = new MigratedTemplate();
  private pGlite: PGlite | undefined;
  private prisma: PrismaClient | undefined;

  async beforeAll() {
    // A fresh database per suite, loaded from the migrated template rather than migrated again
    this.pGlite = await PGlite.create({
      extensions: { postgis },
      loadDataDir: await this.migratedTemplate.getDump(),
    });
    await this.pGlite.waitReady;
    this.prisma = new PrismaClient({ adapter: new PrismaPGlite(this.pGlite) });
  }
  async beforeEach() {
    // The e2e fake clock (jsonwebtoken reads Date for exp) lets tests move time instead of sleeping;
    // real timers stay on so awaits and PGlite I/O still resolve
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'],
    });
  }

  async afterEach() {
    jest.useRealTimers();
  }
  async afterAll() {
    // A failed beforeAll leaves these unset; skipping keeps its error from being replaced by a TypeError
    await this.prisma?.$disconnect();
    await this.pGlite?.close();
  }

  getPGlite(): PGlite {
    if (!this.pGlite) {
      throw new Error('TestDatabase.beforeAll() must run before getPGlite()');
    }
    return this.pGlite;
  }
  getPrisma(): PrismaClient {
    if (!this.prisma) {
      throw new Error('TestDatabase.beforeAll() must run before getPrisma()');
    }
    return this.prisma;
  }
}
