import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FilesService } from './files.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DataCooker } from '../../test/utils/DataCooker/DataCooker';
import { PrismaAdapterMockFactory } from '../../test/utils/mock-services/prisma.adapter.factory';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaAdapterFactory } from '../prisma/prisma.adapter.factory';
import { FileStatus } from '../../generated/prisma/client';
import type { AuthAccount } from '../auth/strategies/jwt.strategy';

describe('FilesService', () => {
  let service: FilesService;
  let prismaService: PrismaService;
  let currentAccount: AuthAccount;
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
      providers: [FilesService],
    })
      .overrideProvider(PrismaAdapterFactory)
      .useValue(new PrismaAdapterMockFactory(dataCooker.getPgLitle()))
      .compile();

    service = module.get<FilesService>(FilesService);
    prismaService = module.get<PrismaService>(PrismaService);

    const account = await prismaService.account.create({
      data: { lastLoginAt: new Date() },
    });
    currentAccount = { accountId: account.id } as AuthAccount;
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });

  describe('createFile', () => {
    it('creates a record without content as FILE_STATUS_CREATED', async () => {
      const file = await service.createFile(
        { name: 'test.png', mimeType: 'image/png' },
        currentAccount,
      );

      expect(file.status).toBe(FileStatus.FILE_STATUS_CREATED);
      expect(file.content).toBeNull();
    });

    it('creates a record with content as FILE_STATUS_UPLOAD_COMPLETED, storing the decoded bytes', async () => {
      const original = Buffer.from('hello world');

      const file = await service.createFile(
        {
          name: 'test.txt',
          mimeType: 'text/plain',
          content: original.toString('base64'),
        },
        currentAccount,
      );

      expect(file.status).toBe(FileStatus.FILE_STATUS_UPLOAD_COMPLETED);
      expect(file.content).not.toBeNull();
      expect(Buffer.from(file.content as Buffer).equals(original)).toBe(true);
    });
  });

  describe('updateFile', () => {
    it('attaches content on a record created without it', async () => {
      const created = await service.createFile(
        { name: 'test.png', mimeType: 'image/png' },
        currentAccount,
      );
      const original = Buffer.from('attached later');

      const updated = await service.updateFile(created.id, {
        status: FileStatus.FILE_STATUS_UPLOAD_COMPLETED,
        content: original.toString('base64'),
      });

      expect(updated.status).toBe(FileStatus.FILE_STATUS_UPLOAD_COMPLETED);
      expect(Buffer.from(updated.content as Buffer).equals(original)).toBe(
        true,
      );
    });
  });
});
