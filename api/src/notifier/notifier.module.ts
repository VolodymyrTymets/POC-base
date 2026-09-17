import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotifierService } from './notifier.service';
import { SmsNotifierService } from './sms-notifier.service';
import { LogNotifierService } from './log-notifier.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QUEUE_NAME as SMS_QUEUE_NAME } from '../background-workers/sms-sender/sms.que.contants';

@Global()
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: SMS_QUEUE_NAME,
    }),
  ],
  providers: [NotifierService, SmsNotifierService, LogNotifierService],
  exports: [NotifierService],
})
export class NotifierModule {}
