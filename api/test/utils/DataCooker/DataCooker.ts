import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PrismaClient } from 'generated/prisma/client';
import { IDataCooker } from './IDataCooker';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { MigrationService } from '../../../src/migrations/migration.service';
import { MigrationsService } from '../../../src/migrations/migrations.service';

export class DataCooker implements IDataCooker {
  constructor() {
    if (!global.pGlite) {
      global.pGlite = new PGlite({
        extensions: {
          postgis,
        },
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.pGlite = global.pGlite;
    this.prisma = new PrismaClient({
      adapter: new PrismaPGlite(this.pGlite),
    });
    this.migrationsService = new MigrationsService(
      new MigrationService(this.prisma),
      this.prisma,
    );
  }
  private readonly pGlite: PGlite;
  private readonly prisma: PrismaClient;
  private prismaMigrationsPath = path.join(
    __dirname,
    '../../../',
    'prisma/migrations',
  );
  private readonly migrationsService: MigrationsService;

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

      await this.pGlite.exec(migration.migrationContent);
    }
  }

  async beforeAll() {
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
    await this.pGlite.close();
    await this.prisma.$disconnect();
    global.pGlite = null;
  }
}
