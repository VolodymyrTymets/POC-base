import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WorkerHost, Processor } from '@nestjs/bullmq';
import {
  QUEUE_NAME,
  Events,
  TOTPCodeMessageDataType,
} from './sms.que.contants';

@Processor(QUEUE_NAME)
export class SmsSenderService extends WorkerHost {
  constructor() {
    super();
  }

  private async onTOTPCodeMessage(data: TOTPCodeMessageDataType) {
    Logger.log(`[SMS] Sending TOTP code to ${data.phone}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    Logger.log(`[SMS] TOTP code sent to ${data.phone}`);
  }

  async process(job: Job) {
    switch (job.name) {
      case Events.TOTPCodeMessage:
        await this.onTOTPCodeMessage(job.data as TOTPCodeMessageDataType);
        break;
    }
  }
}
