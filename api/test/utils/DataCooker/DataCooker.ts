import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PGlite } from '@electric-sql/pglite';
import { PrismaClient } from 'generated/prisma/client';
import { IDataCooker } from './IDataCooker';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { MigrationService } from '../../../src/migrations/migration.service';
import { MigrationsService } from '../../../src/migrations/migrations.service';
import { AccountService } from '../../../src/account/account.service';
import { AccountProfileService } from '../../../src/account-profile/account-profile.service';
import { AccountRoleService } from '../../../src/account-role/account-role.service';
import { FileAssertService } from '../../../src/files/services/file-assert.service';
import type { IPrismaFactory } from '../../../src/prisma/prisma.caching.service';
import { postgis } from '@electric-sql/pglite-postgis';

export class DataCooker implements IDataCooker {
  constructor() {}
  private pGlite: PGlite | undefined;
  private prisma: PrismaClient | undefined;
  private prismaMigrationsPath = path.join(
    __dirname,
    '../../../',
    'prisma/migrations',
  );
  private migrationsService: MigrationsService | undefined;

  private getMigrations() {
    const migrations: Array<{
      migrationName: string;
      migrationFile: string;
      migrationContent: string;
    }> = [];
    Logger.log(
      `[PrismaAdapterFactory] Reading  in ${this.prismaMigrationsPath}: `,
    );
    const migrationsFolder = fs.readdirSync(this.prismaMigrationsPath);
    for (const migration of migrationsFolder) {
      if (
        fs
          .lstatSync(path.join(this.prismaMigrationsPath, migration))
          .isDirectory()
      ) {
        Logger.log(
          `[DataCooker] Reading in: ${path.join(this.prismaMigrationsPath, migration)}`,
        );
        const migrationFiles = fs.readdirSync(
          path.join(this.prismaMigrationsPath, migration),
        );
        for (const migrationFile of migrationFiles) {
          const filePath = path.join(
            this.prismaMigrationsPath,
            migration,
            migrationFile,
          );
          Logger.log(`[DataCooker] Reading migration: ${filePath}`);
          migrations.push({
            migrationName: migration,
            migrationFile: migrationFile,
            migrationContent: fs.readFileSync(filePath, 'utf-8'),
          });
        }
      }
    }
    return migrations;
  }

  private async initMigration() {
    const migrations = this.getMigrations();
    for (const migration of migrations) {
      Logger.log(`DataCooker] Executing migration: ${migration.migrationName}`);
      if (this.pGlite === undefined || this.prisma === undefined) {
        return;
      }
      await this.pGlite.exec(migration.migrationContent);
    }
  }

  async beforeAll() {
    this.pGlite = await PGlite.create({
      extensions: {
        postgis,
      },
    });
    const prisma = new PrismaClient({
      adapter: new PrismaPGlite(this.pGlite),
    });
    this.prisma = prisma;
    const prismaFactory: IPrismaFactory = { create: () => prisma };
    const accountRoleService = new AccountRoleService(prisma, prismaFactory);
    const accountService = new AccountService(
      prisma,
      accountRoleService,
      prismaFactory,
    );
    const accountProfileService = new AccountProfileService(
      prisma,
      prismaFactory,
      new FileAssertService(new ConfigService(), prisma),
    );
    this.migrationsService = new MigrationsService(
      new MigrationService(prisma),
      prisma,
      accountService,
      accountProfileService,
      accountRoleService,
    );
    await this.initMigration();
    await this.migrationsService.runMigrations();
  }
  async beforeEach() {
    // todo: implement data migrations
  }

  async afterEach() {
    // todo: implement
  }
  async afterAll() {
    if (!this.prisma) return;
    if (!this.pGlite) return;
    await this.prisma.$disconnect();
    await this.pGlite.close();
  }

  getPgLitle(): PGlite {
    if (!this.pGlite) {
      throw new Error('DataCooker.beforeAll() must run before getPgLitle()');
    }
    return this.pGlite;
  }
  getPrisma(): PrismaClient {
    if (!this.prisma) {
      throw new Error('DataCooker.beforeAll() must run before getPrisma()');
    }
    return this.prisma;
  }
}
