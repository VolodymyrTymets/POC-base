import { Test, TestingModule } from '@nestjs/testing';
import { AccountProfileService } from './account-profile.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { DataCooker } from '../../test/utils/DataCooker/DataCooker';
import { PrismaAdapterMockFactory } from '../../test/utils/mock-services/prisma.adapter.factory';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaAdapterFactory } from '../prisma/prisma.adapter.factory';
import { AccountRoleModule } from '../account-role/account-role.module';
import { FileAssertService } from '../files/services/file-assert.service';
import { ConflictException } from '@nestjs/common';

describe('AccountProfileService', () => {
  let service: AccountProfileService;
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
        AccountRoleModule,
        PrismaModule,
      ],
      providers: [AccountProfileService, FileAssertService],
    })
      .overrideProvider(PrismaAdapterFactory)
      .useValue(new PrismaAdapterMockFactory(dataCooker.getPgLitle()))
      .compile();

    service = module.get<AccountProfileService>(AccountProfileService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateAccountProfile', () => {
    it('should update profile fields and return the updated profile', async () => {
      const account = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      await prismaService.accountProfile.create({
        data: { accountId: account.id, phoneNumber: '+1234567890' },
      });

      const result = await service.updateAccountProfile(account.id, {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      });

      expect(result).toBeDefined();
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Doe');
      expect(result.accountId).toBe(account.id);

      const dbRecord = await prismaService.accountProfile.findFirst({
        where: { accountId: account.id },
      });
      expect(dbRecord.firstName).toBe('Jane');
      expect(dbRecord.lastName).toBe('Doe');
      expect(dbRecord.email).toBe('jane@example.com');
    });

    it('should do a partial update and preserve unchanged fields', async () => {
      const account = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      await prismaService.accountProfile.create({
        data: {
          accountId: account.id,
          phoneNumber: '+1234567890',
          firstName: 'Original',
        },
      });

      const result = await service.updateAccountProfile(account.id, {
        lastName: 'Updated',
      });

      expect(result.firstName).toBe('Original');
      expect(result.lastName).toBe('Updated');
    });

    it('should throw when accountId does not exist', async () => {
      await expect(
        service.updateAccountProfile('00000000-0000-0000-0000-000000000000', {
          firstName: 'Ghost',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getAccountProfileById', () => {
    it('should return the profile for an existing account', async () => {
      const account = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      await prismaService.accountProfile.create({
        data: { accountId: account.id, phoneNumber: '+1234567890' },
      });

      const result = await service.getAccountProfileById(account.id);

      expect(result).toBeDefined();
      expect(result.accountId).toBe(account.id);
      expect(result.phoneNumber).toBe('+1234567890');
    });

    it('should return null when no profile exists for the account', async () => {
      const result = await service.getAccountProfileById(
        '00000000-0000-0000-0000-000000000000',
      );

      expect(result).toBeNull();
    });

    it('should work without a GraphQL info argument', async () => {
      const account = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      await prismaService.accountProfile.create({
        data: { accountId: account.id, firstName: 'John' },
      });

      const result = await service.getAccountProfileById(account.id, undefined);

      expect(result).toBeDefined();
      expect(result.firstName).toBe('John');
    });
  });

  describe('updateAccountProfile email', () => {
    const createProfile = async (phoneNumber: string, email?: string) => {
      const account = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      await prismaService.accountProfile.create({
        data: { accountId: account.id, phoneNumber, email },
      });
      return account;
    };

    it('should store the email trimmed and lowercased, as the auth flows look it up', async () => {
      const account = await createProfile('+15550001001');

      await service.updateAccountProfile(account.id, {
        email: 'Mixed.Case@Example.COM',
      });

      const stored = await prismaService.accountProfile.findFirstOrThrow({
        where: { accountId: account.id },
      });
      expect(stored.email).toBe('mixed.case@example.com');
    });

    it('should reject an email another account already has, ignoring case', async () => {
      await createProfile('+15550001002', 'taken.profile@example.com');
      const other = await createProfile('+15550001003');

      await expect(
        service.updateAccountProfile(other.id, {
          email: 'TAKEN.profile@example.com',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should leave the email alone when the update does not include it', async () => {
      const account = await createProfile(
        '+15550001004',
        'keep.me@example.com',
      );

      await service.updateAccountProfile(account.id, { firstName: 'Kept' });

      const stored = await prismaService.accountProfile.findFirstOrThrow({
        where: { accountId: account.id },
      });
      expect(stored.email).toBe('keep.me@example.com');
    });
  });
});
