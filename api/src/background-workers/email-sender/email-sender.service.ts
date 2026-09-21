import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkerHost, Processor } from '@nestjs/bullmq';
import {
  QUEUE_NAME,
  Events,
  PasswordResetMessageDataType,
} from './email.queue.constants';

// POC stage: no email provider is wired, so "sending" is logging. The message
// content (recipient + reset token) is only written where a developer needs it
// to finish the flow by hand; anywhere else the log carries the account id only.
const LOG_MESSAGE_ENVIRONMENTS = ['local', 'development', 'test'];

@Processor(QUEUE_NAME)
export class EmailSenderService extends WorkerHost {
  private readonly logger = new Logger(EmailSenderService.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  private onPasswordResetMessage(data: PasswordResetMessageDataType) {
    const environment = this.configService.get<string>('NODE_ENV') ?? '';
    if (LOG_MESSAGE_ENVIRONMENTS.includes(environment)) {
      this.logger.log(
        `[EMAIL] Password reset for ${data.email} (account ${data.accountId}): token ${data.token}`,
      );
      return;
    }
    this.logger.log(
      `[EMAIL] Password reset email queued for account ${data.accountId}; no email provider is configured`,
    );
  }

  // Idempotent: a retried job only logs the same message again.
  async process(job: Pick<Job, 'name' | 'data'>) {
    switch (job.name) {
      case Events.PasswordResetMessage:
        this.onPasswordResetMessage(job.data as PasswordResetMessageDataType);
        break;
    }
  }
}
