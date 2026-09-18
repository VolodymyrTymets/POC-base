import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { FileAssertService } from './file-assert.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { DataCooker } from '../../../test/utils/DataCooker/DataCooker';
import { PrismaAdapterMockFactory } from '../../../test/utils/mock-services/prisma.adapter.factory';
import { PrismaAdapterFactory } from '../../prisma/prisma.adapter.factory';

describe('FileAssertService', () => {
  let service: FileAssertService;
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
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });

  describe('assertFileInput', () => {
    it('accepts content within the size limit', () => {
      const content = Buffer.alloc(1024).toString('base64');

      expect(service.assertFileInput({ content })).toBe(true);
    });

    it('rejects decoded content larger than FILE_MAX_SIZE', () => {
      const oversized = Buffer.alloc(1024 * 1024 * 20).toString('base64');

      expect(() => service.assertFileInput({ content: oversized })).toThrow(
        ForbiddenException,
      );
    });

    it('accepts a missing content field', () => {
      expect(service.assertFileInput({ name: 'test.png' })).toBe(true);
    });
  });
});
