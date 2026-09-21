import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NotifierServiceInterface,
  NotifierTypes,
} from './notifier.service.interface';
import { SmsNotifierService } from './sms-notifier.service';
import { LogNotifierService } from './log-notifier.service';
import { EmailNotifierService } from './email-notifier.service';
import type { AccountModel } from 'generated/prisma/models/Account';

@Injectable()
export class NotifierService implements NotifierServiceInterface {
  constructor(
    @Inject(SmsNotifierService)
    private readonly smsNotifierService: SmsNotifierService,
    @Inject(LogNotifierService)
    private readonly logNotifierService: LogNotifierService,
    @Inject(EmailNotifierService)
    private readonly emailNotifierService: EmailNotifierService,
  ) {
    this.notifiers = [
      this.smsNotifierService,
      this.logNotifierService,
      this.emailNotifierService,
    ];
  }
  private readonly logger = new Logger(NotifierService.name);
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
        case NotifierTypes.EMAIL:
          return notifier instanceof EmailNotifierService;
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
    ).catch((error: unknown) =>
      this.logger.error(
        'Error in notifyAboutTOTPCode',
        error instanceof Error ? error.stack : String(error),
      ),
    );
  }

  // A failure here is logged, not rethrown: the caller answers identically
  // whether or not the email exists, and a throw would reveal which do.
  async notifyAboutPasswordReset(
    account: AccountModel,
    token: string,
    types: Array<NotifierTypes>,
  ) {
    await Promise.all(
      this.notifiers
        .filter((n) => this.filterNotifiersByNeeds(n, types))
        .map((notifier) =>
          notifier.notifyAboutPasswordReset(account, token, types),
        ),
    ).catch((error: unknown) =>
      this.logger.error(
        `Failed to notify account ${account.id} about a password reset`,
        error instanceof Error ? error.stack : String(error),
      ),
    );
  }
}
