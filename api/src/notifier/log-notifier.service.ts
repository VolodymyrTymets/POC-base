import { Injectable, Logger } from '@nestjs/common';
import { NotifierServiceInterface } from './notifier.service.interface';
import { type AccountModel } from 'generated/prisma/models';

@Injectable()
export class LogNotifierService implements NotifierServiceInterface {
  async notifyAboutTOTPCode(account: AccountModel, code: string) {
    if (process.env.NODE_ENV === 'local') {
      Logger.debug(`  TOTPCode: `, code);
    }
  }

  // The email worker already logs reset messages; nothing to add here.
  async notifyAboutPasswordReset() {}
}
