import { BullModule } from '@nestjs/bullmq';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { SmsSenderModule } from './sms-sender/sms-sender.module';
import { QUEUE_NAME as SMS_QUEUE_NAME } from './sms-sender/sms.que.contants';
import { EmailSenderModule } from './email-sender/email-sender.module';
import { QUEUE_NAME as EMAIL_QUEUE_NAME } from './email-sender/email.queue.constants';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SentryModule.forRoot(),
    BullModule.forRoot({
      connection: {
        port: parseInt(process.env.REDIS_PORT as string, 10),
        host: process.env.REDIS_HOST,
      },
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: true,
      },
    }),
    BullModule.registerQueue({
      name: SMS_QUEUE_NAME,
    }),
    BullModule.registerQueue({
      name: EMAIL_QUEUE_NAME,
    }),
    SmsSenderModule,
    EmailSenderModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class WorkerModule {}
