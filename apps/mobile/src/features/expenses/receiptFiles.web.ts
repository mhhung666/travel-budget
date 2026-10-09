export type { SelectedReceipt } from './receiptFiles';
const unavailable = async (): Promise<never> => {
  throw new Error('NATIVE_REQUIRED');
};
export const pickReceipt = unavailable;
export const uploadReceiptFile = unavailable;
export const removeReceiptFile = unavailable;
export const cleanupReceiptFiles = unavailable;
