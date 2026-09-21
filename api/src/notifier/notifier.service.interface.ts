import { type AccountModel } from 'generated/prisma/models';

export enum NotifierTypes {
  SMS = 'SMS',
  LOG = 'LOG',
  EMAIL = 'EMAIL',
  ALL = 'ALL',
}
export interface NotifierServiceInterface {
  notifyAboutTOTPCode(
    account: AccountModel,
    code: string,
    type: Array<NotifierTypes>,
  ): Promise<void>;
  notifyAboutPasswordReset(
    account: AccountModel,
    token: string,
    type: Array<NotifierTypes>,
  ): Promise<void>;
}
