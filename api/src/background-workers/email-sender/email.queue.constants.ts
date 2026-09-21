export const QUEUE_NAME = 'EMAIL_QUEUE';
export const Events = { PasswordResetMessage: 'PasswordResetMessage' };
export type PasswordResetMessageDataType = {
  accountId: string;
  email: string;
  token: string;
};
