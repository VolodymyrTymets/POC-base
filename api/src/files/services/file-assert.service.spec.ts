import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { FileAssertService } from './file-assert.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { DataCooker } from '../../../test/utils/DataCooker/DataCooker';
import { PrismaAdapterMockFactory } from '../../../test/utils/mock-services/prisma.adapter.factory';
import { PrismaAdapterFactory } from '../../prisma/prisma.adapter.factory';
import { PrismaService } from '../../prisma/prisma.service';

describe('FileAssertService', () => {
  let service: FileAssertService;
  let prismaService: PrismaService;
  const dataCooker = new DataCooker();

  beforeAll(async () => {
    await dataCooker.beforeAll();
  });

  beforeEach(async () => {
    await dataCooker.beforeEach();
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        PrismaModule,
      ],
      providers: [FileAssertService],
    })
      .overrideProvider(PrismaAdapterFactory)
      .useValue(new PrismaAdapterMockFactory(dataCooker.getPgLitle()))
      .compile();

    service = module.get<FileAssertService>(FileAssertService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });

  describe('assertFileInput', () => {
    it('accepts content within the size limit, given an allowed mimeType', () => {
      const content = Buffer.alloc(1024).toString('base64');

      expect(
        service.assertFileInput({ content, mimeType: 'image/png' }),
      ).toBe(true);
    });

    it('rejects decoded content larger than FILE_MAX_SIZE', () => {
      const oversized = Buffer.alloc(1024 * 1024 * 20).toString('base64');

      expect(() =>
        service.assertFileInput({ content: oversized, mimeType: 'image/png' }),
      ).toThrow(ForbiddenException);
    });

    it('rejects content with no mimeType', () => {
      const content = Buffer.alloc(1024).toString('base64');

      expect(() => service.assertFileInput({ content })).toThrow(
        ForbiddenException,
      );
    });

    it('accepts a missing content field', () => {
      expect(service.assertFileInput({ name: 'test.png' })).toBe(true);
    });
  });

  describe('assertUpdateFile', () => {
    it('rejects an update from an account that does not own the file', async () => {
      const owner = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      const otherAccount = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      const file = await prismaService.file.create({
        data: {
          name: 'test.png',
          mimeType: 'image/png',
          createdById: owner.id,
        },
      });

      await expect(
        service.assertUpdateFile(file.id, { name: 'renamed.png' }, otherAccount.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('falls back to the stored mimeType when content is sent without one', async () => {
      const owner = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      const file = await prismaService.file.create({
        data: {
          name: 'test.png',
          mimeType: 'image/png',
          createdById: owner.id,
        },
      });
      const content = Buffer.alloc(1024).toString('base64');

      await expect(
        service.assertUpdateFile(file.id, { content }, owner.id),
      ).resolves.not.toThrow();
    });

    it('still rejects content with no mimeType anywhere (call or record)', async () => {
      const owner = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      const file = await prismaService.file.create({
        data: { name: 'test.png', createdById: owner.id },
      });
      const content = Buffer.alloc(1024).toString('base64');

      await expect(
        service.assertUpdateFile(file.id, { content }, owner.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertFileAccessByAccount', () => {
    it('rejects access from an account that does not own the file', async () => {
      const owner = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      const otherAccount = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      const file = await prismaService.file.create({
        data: {
          name: 'test.png',
          mimeType: 'image/png',
          createdById: owner.id,
        },
      });

      await expect(
        service.assertFileAccessByAccount(file.id, otherAccount.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
