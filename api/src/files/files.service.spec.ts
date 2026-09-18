import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FilesService } from './files.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DataCooker } from '../../test/utils/DataCooker/DataCooker';
import { PrismaAdapterMockFactory } from '../../test/utils/mock-services/prisma.adapter.factory';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaAdapterFactory } from '../prisma/prisma.adapter.factory';
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
    it('creates a record without content', async () => {
      const file = await service.createFile(
        { name: 'test.png', mimeType: 'image/png' },
        currentAccount,
      );

      expect(file.content).toBeNull();
    });

    it('creates a record with content, storing the decoded bytes and derived size', async () => {
      const original = Buffer.from('hello world');

      const file = await service.createFile(
        {
          name: 'test.txt',
          mimeType: 'text/plain',
          size: 1,
          content: original.toString('base64'),
        },
        currentAccount,
      );

      // Decoded byte length wins over the client-declared size (1).
      expect(file.size).toBe(original.byteLength);
      if (!file.content) {
        throw new Error('expected file.content to be set');
      }
      expect(Buffer.from(file.content).equals(original)).toBe(true);
    });
  });

  describe('updateFile', () => {
    it('attaches content on a record created without it, deriving size', async () => {
      const created = await service.createFile(
        { name: 'test.png', mimeType: 'image/png' },
        currentAccount,
      );
      const original = Buffer.from('attached later');

      const updated = await service.updateFile(created.id, {
        content: original.toString('base64'),
      });

      expect(updated.size).toBe(original.byteLength);
      if (!updated.content) {
        throw new Error('expected updated.content to be set');
      }
      expect(Buffer.from(updated.content).equals(original)).toBe(true);
    });
  });

  describe('findFile', () => {
    it('excludes content by default', async () => {
      const created = await service.createFile(
        {
          name: 'test.png',
          mimeType: 'image/png',
          content: Buffer.from('secret bytes').toString('base64'),
        },
        currentAccount,
      );

      const found = await service.findFile(created.id);

      expect(found).toBeDefined();
      expect(found?.content).toBeUndefined();
    });

    it('includes content when explicitly requested', async () => {
      const original = Buffer.from('secret bytes');
      const created = await service.createFile(
        { name: 'test.png', mimeType: 'image/png', content: original.toString('base64') },
        currentAccount,
      );

      const found = await service.findFile(created.id, true);

      if (!found?.content) {
        throw new Error('expected found.content to be set');
      }
      expect(Buffer.from(found.content).equals(original)).toBe(true);
    });
  });
});
