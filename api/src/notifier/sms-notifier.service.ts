import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { NotifierServiceInterface } from './notifier.service.interface';
import { type AccountModel } from 'generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import {
  QUEUE_NAME as SMS_QUEUE_NAME,
  Events,
  // type TOTPCodeMessageDataType,
} from '../background-workers/sms-sender/sms.que.contants';

@Injectable()
export class SmsNotifierService implements NotifierServiceInterface {
  constructor(
    @InjectQueue(SMS_QUEUE_NAME) private readonly smsQueue: Queue,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async notifyAboutTOTPCode(account: AccountModel, code: string) {
    const accountProfile = await this.prisma.accountProfile.findUnique({
      where: { accountId: account.id },
      select: { phoneNumber: true },
    });
    if (!accountProfile?.phoneNumber) {
      return;
    }
    await this.smsQueue.add(Events.TOTPCodeMessage, {
      phone: accountProfile.phoneNumber,
      code,
    });
  }
}
