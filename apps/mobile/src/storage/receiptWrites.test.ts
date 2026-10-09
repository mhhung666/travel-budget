import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { memoryDatabase } from '@/test/sqlite';
import { createReceiptWriteStore, type LocalReceiptWrite } from './receiptWrites';
const scope = { environment: 'https://test', accountId: 'a'.repeat(24) };
const record: LocalReceiptWrite = {
  tripId: 'b'.repeat(24),
  expenseId: 'c'.repeat(24),
  input: {
    action: 'add',
    client_request_id: '11111111-1111-4111-8111-111111111111',
    contentType: 'image/jpeg',
    size: 100,
  },
  file: '22222222-2222-4222-8222-222222222222',
  cancel: false,
  result: null,
};
it('reopens a real SQLite file with the same frozen UUID, file ownership and cancellation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-receipt-write-'));
  let db = memoryDatabase(join(dir, 'receipts.db'));
  try {
    let store = await createReceiptWriteStore(db);
    await store.insert(scope, record);
    await store.save(scope, { ...record, cancel: true });
    db.close();
    db = memoryDatabase(join(dir, 'receipts.db'));
    store = await createReceiptWriteStore(db);
    expect(await store.list(scope)).toEqual([{ ...record, cancel: true }]);
    await expect(
      store.save(scope, { ...record, input: { ...record.input, size: 101 } } as LocalReceiptWrite)
    ).rejects.toThrow('RECEIPT_WRITE_CHANGED');
    await store.save(scope, record);
    expect((await store.list(scope))[0].cancel).toBe(true);
    await store.remove(scope, record);
    const next = {
      ...record,
      input: { ...record.input, client_request_id: '33333333-3333-4333-8333-333333333333' },
    };
    await store.insert(scope, next);
    await expect(store.save(scope, record)).rejects.toThrow('RECEIPT_WRITE_CHANGED');
    await store.remove(scope, record);
    expect(await store.list(scope)).toEqual([next]);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
