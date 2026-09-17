import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from './account.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { DataCooker } from '../../test/utils/DataCooker/DataCooker';
import { PrismaAdapterMockFactory } from '../../test/utils/mock-services/prisma.adapter.factory';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaAdapterFactory } from '../prisma/prisma.adapter.factory';
import { AccountRoleModule } from '../account-role/account-role.module';

describe('AccountService', () => {
  let service: AccountService;
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
        AccountRoleModule,
      ],
      providers: [AccountService],
    })
      .overrideProvider(PrismaAdapterFactory)
      .useValue(new PrismaAdapterMockFactory(dataCooker.getPgLitle()))
      .compile();

    service = module.get<AccountService>(AccountService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAccountById', () => {
    it('should return the account for an existing id', async () => {
      const account = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });

      const result = await service.getAccountById(account.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(account.id);
    });

    it('should return null when no account exists for the id', async () => {
      const result = await service.getAccountById(
        '00000000-0000-0000-0000-000000000000',
      );

      expect(result).toBeNull();
    });

    it('should work without a GraphQL info argument', async () => {
      const account = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });

      const result = await service.getAccountById(account.id, undefined);

      expect(result).toBeDefined();
      expect(result.id).toBe(account.id);
    });
  });

  describe('getAccountByPhoneNumber', () => {
    it('should return the account matching the profile phone number', async () => {
      const account = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      await prismaService.accountProfile.create({
        data: { accountId: account.id, phoneNumber: '+1234567890' },
      });

      const result = await service.getAccountByPhoneNumber('+1234567890');

      expect(result).toBeDefined();
      expect(result.id).toBe(account.id);
    });

    it('should return null when no profile has the phone number', async () => {
      const result = await service.getAccountByPhoneNumber('+0000000000');

      expect(result).toBeNull();
    });

    it('should work without a GraphQL info argument', async () => {
      const account = await prismaService.account.create({
        data: { lastLoginAt: new Date() },
      });
      await prismaService.accountProfile.create({
        data: { accountId: account.id, phoneNumber: '+1987654321' },
      });

      const result = await service.getAccountByPhoneNumber(
        '+1987654321',
        undefined,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(account.id);
    });
  });

  describe('createAccount', () => {
    it('should create an account with the given phone number profile', async () => {
      const result = await service.createCustomerAccount('+1444555666');

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.lastLoginAt).toBeInstanceOf(Date);

      const profile = await prismaService.accountProfile.findFirst({
        where: { accountId: result.id },
      });
      expect(profile).toBeDefined();
      expect(profile.phoneNumber).toBe('+1444555666');
    });

    it('should be retrievable by phone number after creation', async () => {
      const created = await service.createCustomerAccount('+1555666777');

      const found = await service.getAccountByPhoneNumber('+1555666777');

      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
    });
  });
});
