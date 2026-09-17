import { type AccountModel } from 'generated/prisma/models';

export enum NotifierTypes {
  SMS = 'SMS',
  LOG = 'LOG',
  ALL = 'ALL',
}
export interface NotifierServiceInterface {
  notifyAboutTOTPCode(
    account: AccountModel,
    code: string,
    type: Array<NotifierTypes>,
  ): Promise<void>;
}
