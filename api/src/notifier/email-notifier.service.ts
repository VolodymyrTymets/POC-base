import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { NotifierServiceInterface } from './notifier.service.interface';
import { type AccountModel } from 'generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import {
  QUEUE_NAME as EMAIL_QUEUE_NAME,
  Events,
  type PasswordResetMessageDataType,
} from '../background-workers/email-sender/email.queue.constants';

@Injectable()
export class EmailNotifierService implements NotifierServiceInterface {
  constructor(
    @InjectQueue(EMAIL_QUEUE_NAME) private readonly emailQueue: Queue,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  // Codes are delivered by SMS; nothing to do on the email channel.
  async notifyAboutTOTPCode() {}

  async notifyAboutPasswordReset(account: AccountModel, token: string) {
    const accountProfile = await this.prisma.accountProfile.findUnique({
      where: { accountId: account.id },
      select: { email: true },
    });
    if (!accountProfile?.email) {
      return;
    }
    const message: PasswordResetMessageDataType = {
      accountId: account.id,
      email: accountProfile.email,
      token,
    };
    await this.emailQueue.add(Events.PasswordResetMessage, message, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }
}
