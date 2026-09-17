import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class MigrationService {
  constructor(private prisma: PrismaService) {}

  find(whereInput: Prisma.MigrationWhereInput) {
    return this.prisma.migration.findFirst({
      where: whereInput,
    });
  }

  create(createInput: Prisma.MigrationCreateInput) {
    return this.prisma.migration.create({
      data: { ...createInput, successful: false },
    });
  }

  makeSuccessful(
    whereUniq: Prisma.MigrationWhereUniqueInput,
    data?: Prisma.MigrationUpdateInput,
  ) {
    return this.prisma.migration.update({
      where: whereUniq,
      data: { ...data, successful: true },
    });
  }

  makeFailed(
    whereUniq: Prisma.MigrationWhereUniqueInput,
    data?: Prisma.MigrationUpdateInput,
  ) {
    return this.prisma.migration.update({
      where: whereUniq,
      data: { ...data, successful: false },
    });
  }

  async startMigration({
    migration,
    name,
  }: {
    migration: () => Promise<void>;
    name: string;
  }) {
    const alreadyPassed = await this.find({
      name,
      successful: true,
    });
    if (alreadyPassed) {
      return;
    }

    const { id } = await this.create({ name: name });
    try {
      if (process.env.NODE_ENV !== 'test') {
        console.time(`RUNNING MIGRATION: ${name}`);
      }
      await migration();
      await this.makeSuccessful({ id });
      if (process.env.NODE_ENV !== 'test') {
        console.timeEnd(`RUNNING MIGRATION: ${name}`);
      }
    } catch (err: any) {
      await this.makeFailed({ id }, { result: err.toString() });
    }
  }
}
