import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { EmailNotifierService } from './email-notifier.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaAdapterFactory } from '../prisma/prisma.adapter.factory';
import { DataCooker } from '../../test/utils/DataCooker/DataCooker';
import { PrismaAdapterMockFactory } from '../../test/utils/mock-services/prisma.adapter.factory';
import {
  QUEUE_NAME,
  Events,
} from '../background-workers/email-sender/email.queue.constants';

describe('EmailNotifierService', () => {
  let emailNotifierService: EmailNotifierService;
  let prismaService: PrismaService;
  // Redis is the external edge here; the database is the real PGlite one.
  const emailQueue = { add: jest.fn() };
  const dataCooker = new DataCooker();

  beforeAll(async () => {
    await dataCooker.beforeAll();
  });

  beforeEach(async () => {
    emailQueue.add.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' }),
        PrismaModule,
      ],
      providers: [
        EmailNotifierService,
        { provide: getQueueToken(QUEUE_NAME), useValue: emailQueue },
      ],
    })
      .overrideProvider(PrismaAdapterFactory)
      .useValue(new PrismaAdapterMockFactory(dataCooker.getPgLitle()))
      .compile();
    emailNotifierService = app.get(EmailNotifierService);
    prismaService = app.get(PrismaService);
  });

  afterAll(async () => {
    await dataCooker.afterAll();
  });

  const createAccount = (profile: { email?: string; phoneNumber?: string }) =>
    prismaService.account.create({
      data: { lastLoginAt: new Date(), AccountProfile: { create: profile } },
    });

  it('queues a password-reset job for the account email with backoff and short retention', async () => {
    const account = await createAccount({ email: 'notify.me@example.com' });

    await emailNotifierService.notifyAboutPasswordReset(account, 'token-123');

    expect(emailQueue.add).toHaveBeenCalledTimes(1);
    expect(emailQueue.add).toHaveBeenCalledWith(
      Events.PasswordResetMessage,
      {
        accountId: account.id,
        email: 'notify.me@example.com',
        token: 'token-123',
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: { age: 3600 },
      },
    );
  });

  it('queues nothing for an account without an email', async () => {
    const account = await createAccount({ phoneNumber: '+12125550199' });

    await emailNotifierService.notifyAboutPasswordReset(account, 'token-123');

    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  it('does nothing when asked to notify about an OTP code', async () => {
    await emailNotifierService.notifyAboutTOTPCode();

    expect(emailQueue.add).not.toHaveBeenCalled();
  });
});
