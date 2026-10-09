import type { ReceiptWriteStore } from './receiptWrites';
/** Web preview cannot sign in or persist private attachments. */
export function openReceiptWriteStore(): Promise<ReceiptWriteStore> {
  return Promise.reject(new Error('NATIVE_REQUIRED'));
}
