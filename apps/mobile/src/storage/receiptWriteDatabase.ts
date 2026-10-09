import * as SQLite from 'expo-sqlite';
import { createReceiptWriteStore, type ReceiptWriteStore } from './receiptWrites';
let opening: Promise<ReceiptWriteStore> | undefined;
export function openReceiptWriteStore() {
  opening ??= SQLite.openDatabaseAsync('travel-budget-receipt-writes.db')
    .then(createReceiptWriteStore)
    .catch((e: unknown) => {
      opening = undefined;
      throw e;
    });
  return opening;
}
