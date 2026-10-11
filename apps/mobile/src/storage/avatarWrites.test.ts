import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { memoryDatabase } from '@/test/sqlite';
import { createAvatarWriteStore, type LocalAvatarWrite } from './avatarWrites';
const scope = { environment: 'https://test', accountId: 'a'.repeat(24) };
const record: LocalAvatarWrite = {
  input: {
    action: 'replace',
    client_request_id: '11111111-1111-4111-8111-111111111111',
    expectedRevision: 'a'.repeat(64),
    contentType: 'image/jpeg',
    size: 100,
  },
  file: '22222222-2222-4222-8222-222222222222',
  cancel: false,
  result: null,
};
it('reopens confirmed avatars with immutable input, monotonic cancellation/terminal result and account/environment isolation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-avatar-'));
  let db = memoryDatabase(join(dir, 'avatar.db'));
  try {
    let store = await createAvatarWriteStore(db);
    await store.insert(scope, record);
    await store.save(scope, { ...record, cancel: true });
    db.close();
    db = memoryDatabase(join(dir, 'avatar.db'));
    store = await createAvatarWriteStore(db);
    expect(await store.list(scope)).toEqual([{ ...record, cancel: true }]);
    for (const other of [
      { ...scope, accountId: 'b'.repeat(24) },
      { ...scope, environment: 'https://other' },
    ]) {
      expect(await store.list(other)).toEqual([]);
      await store.insert(other, record);
    }
    await expect(store.insert(scope, record)).rejects.toThrow();
    await expect(
      store.save(scope, { ...record, input: { ...record.input, size: 101 } } as LocalAvatarWrite)
    ).rejects.toThrow('AVATAR_WRITE_CHANGED');
    const result = {
      clientRequestId: record.input.client_request_id,
      status: 'rejected' as const,
      code: 'CANCELLED' as const,
    };
    await store.save(scope, { ...record, result });
    await store.save(scope, record);
    expect((await store.list(scope))[0]).toEqual({ ...record, cancel: true, result });
    await store.remove(scope, record);
    expect(await store.list(scope)).toEqual([]);
    expect(await store.files()).toEqual([record.file, record.file]);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
