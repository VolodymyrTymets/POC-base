import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { MigrationService } from '../../../src/migrations/migration.service';
import { MigrationsService } from '../../../src/migrations/migrations.service';
import { AccountService } from '../../../src/account/account.service';
import { AccountProfileService } from '../../../src/account-profile/account-profile.service';
import { AccountRoleService } from '../../../src/account-role/account-role.service';
import { FileAssertService } from '../../../src/files/services/file-assert.service';
import type { IPrismaFactory } from '../../../src/prisma/prisma.caching.service';
import { IMigratedTemplate } from './IMigratedTemplate';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Structural, not `instanceof Error`: under jest's vm sandbox an fs error comes from another realm
const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' && error !== null && 'code' in error;

export class MigratedTemplate implements IMigratedTemplate {
  private readonly migrationsPath = path.join(
    __dirname,
    '../../../prisma/migrations',
  );
  private readonly seedPath = path.join(__dirname, '../../../src/migrations');
  private readonly lockTimeoutMs = 120_000;
  private readonly templateName = 'poc-base-pglite';

  // The Prisma migrations in order, then the seed items (rule P4): the one schema every suite starts from
  private async build(): Promise<PGlite> {
    const pGlite = await PGlite.create({ extensions: { postgis } });
    // migration_lock.toml sits beside the migration folders and is not SQL
    const migrationDirs = fs
      .readdirSync(this.migrationsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(this.migrationsPath, entry.name))
      .sort();
    for (const file of migrationDirs.flatMap((dir) => this.filesUnder(dir))) {
      await pGlite.exec(fs.readFileSync(file, 'utf-8'));
    }
    const prisma = new PrismaClient({ adapter: new PrismaPGlite(pGlite) });
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
    await new MigrationsService(
      new MigrationService(prisma),
      prisma,
      accountService,
      accountProfileService,
      accountRoleService,
    ).runMigrations();
    await prisma.$disconnect();
    return pGlite;
  }

  // A database dump every suite loads instead of replaying every migration. The first suite to ask builds it
  // (an atomic lock directory elects it); parallel workers wait for the file, written by rename so it is whole.
  // A run killed mid-build leaves `<template>.lock` behind: delete that directory to recover.
  async getDump(): Promise<Blob> {
    const file = this.templatePath();
    const lock = `${file}.lock`;
    const deadline = Date.now() + this.lockTimeoutMs;
    while (!fs.existsSync(file)) {
      let elected = false;
      try {
        fs.mkdirSync(lock);
        elected = true;
      } catch (error) {
        if (!isErrnoException(error) || error.code !== 'EEXIST') throw error;
      }
      if (elected) {
        try {
          const pGlite = await this.build();
          const dump = await pGlite.dumpDataDir('none');
          await pGlite.close();
          const partial = `${file}.${process.pid}.partial`;
          fs.writeFileSync(partial, Buffer.from(await dump.arrayBuffer()));
          fs.renameSync(partial, file);
        } finally {
          fs.rmdirSync(lock);
        }
      } else if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for the PGlite template ${file}`);
      } else {
        await sleep(200);
      }
    }
    return new Blob([fs.readFileSync(file)]);
  }

  // Keyed by the content of everything that shapes the template, so a new migration or seed item rebuilds it
  private templatePath(): string {
    const hash = crypto.createHash('sha1');
    for (const file of [
      ...this.filesUnder(this.migrationsPath),
      ...this.filesUnder(this.seedPath),
    ]) {
      hash.update(file).update(fs.readFileSync(file));
    }
    return path.join(
      os.tmpdir(),
      `${this.templateName}-${hash.digest('hex').slice(0, 16)}.tar`,
    );
  }

  private filesUnder(dir: string): string[] {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? this.filesUnder(full) : [full];
      });
  }
}
