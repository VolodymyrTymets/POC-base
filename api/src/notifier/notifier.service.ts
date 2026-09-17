import { Inject, Injectable } from '@nestjs/common';
import {
  NotifierServiceInterface,
  NotifierTypes,
} from './notifier.service.interface';
import { SmsNotifierService } from './sms-notifier.service';
import { LogNotifierService } from './log-notifier.service';
import type { AccountModel } from 'generated/prisma/models/Account';

@Injectable()
export class NotifierService implements NotifierServiceInterface {
  constructor(
    @Inject(SmsNotifierService)
    private readonly smsNotifierService: SmsNotifierService,
    @Inject(LogNotifierService)
    private readonly logNotifierService: LogNotifierService,
  ) {
    this.notifiers = [this.smsNotifierService, this.logNotifierService];
  }
  private notifiers: Array<NotifierServiceInterface> = [];
  private filterNotifiersByNeeds(
    notifier: NotifierServiceInterface,
    types: Array<NotifierTypes>,
  ) {
    const filtered = types.filter((type) => {
      switch (type) {
        case NotifierTypes.ALL:
          return true;
        case NotifierTypes.SMS:
          return notifier instanceof SmsNotifierService;
        case NotifierTypes.LOG:
          return notifier instanceof LogNotifierService;
      }
    });
    return filtered.length ? notifier : null;
  }
  async notifyAboutTOTPCode(
    account: AccountModel,
    code: string,
    types: Array<NotifierTypes>,
  ) {
    await Promise.all(
      this.notifiers
        .filter((n) => this.filterNotifiersByNeeds(n, types))
        .map((notifier) => notifier.notifyAboutTOTPCode(account, code, types)),
    ).catch((error) => console.error('Error in notifyAboutTOTPCode', error));
  }
}
