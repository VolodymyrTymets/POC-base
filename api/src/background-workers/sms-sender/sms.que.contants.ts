export const QUEUE_NAME = 'SMS_QUEUE';
export const Events = { TOTPCodeMessage: 'TOTPCodeMessage' };
export type TOTPCodeMessageDataType = {
  phone: string;
  code: string;
};
