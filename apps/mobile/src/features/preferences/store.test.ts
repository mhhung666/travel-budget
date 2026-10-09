import { expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PreferenceStore, defaults } from './store';
import { memoryDatabase } from '@/test/sqlite';
import { createPreferenceStorage } from '@/storage/preferenceSql';

function fixture(raw: string | null = null) {
  const storage = {
    read: vi.fn(async () => raw),
    write: vi.fn(async (value: string) => {
      raw = value;
    }),
  };
  return { storage, store: new PreferenceStore(storage) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it('defaults to system without creating a record and starts only once', async () => {
  const { store, storage } = fixture();
  await Promise.all([store.start(), store.start()]);
  expect(store.getSnapshot()).toMatchObject({ ready: true, loaded: true, value: defaults });
  expect(storage.read).toHaveBeenCalledTimes(1);
  expect(storage.write).not.toHaveBeenCalled();
});
it('does not apply a choice before its write finishes; serialized changes preserve both fields', async () => {
  const { store, storage } = fixture();
  await store.start();
  const pending = deferred<void>();
  storage.write.mockImplementationOnce(() => pending.promise);
  const language = store.update({ language: 'jp' });
  const appearance = store.update({ appearance: 'dark' });
  await vi.waitFor(() => expect(store.getSnapshot().busy).toBe(true));
  expect(store.getSnapshot().value).toEqual(defaults);
  pending.resolve();
  await Promise.all([language, appearance]);
  expect(store.getSnapshot().value).toEqual({ version: 1, language: 'jp', appearance: 'dark' });
  const restart = new PreferenceStore(storage);
  await restart.start();
  expect(restart.getSnapshot().value).toEqual(store.getSnapshot().value);
});
it('waits for startup so a late read cannot overwrite a newer choice', async () => {
  const { store, storage } = fixture();
  const pending = deferred<string>();
  storage.read.mockImplementationOnce(() => pending.promise);
  const start = store.start();
  const update = store.update({ language: 'en' });
  pending.resolve(JSON.stringify({ ...defaults, appearance: 'dark' }));
  await Promise.all([start, update]);
  expect(store.getSnapshot().value).toEqual({ version: 1, language: 'en', appearance: 'dark' });
});
it('preserves the last durable choice on failure and allows retry', async () => {
  const { store, storage } = fixture();
  await store.start();
  await store.update({ language: 'zh-CN' });
  storage.write.mockRejectedValueOnce(new Error('full'));
  await store.update({ appearance: 'dark' });
  expect(store.getSnapshot()).toMatchObject({
    value: { language: 'zh-CN', appearance: 'system' },
    error: 'save',
    busy: false,
  });
  await store.update({ appearance: 'dark' });
  expect(store.getSnapshot()).toMatchObject({ value: { appearance: 'dark' }, error: null });
});
it('does not overwrite unread settings until an explicit reset or successful reload', async () => {
  const { store, storage } = fixture(JSON.stringify({ ...defaults, language: 'jp' }));
  storage.read.mockRejectedValueOnce(new Error('unavailable'));
  await store.start();
  await store.update({ language: 'en' });
  expect(storage.write).not.toHaveBeenCalled();
  expect(store.getSnapshot()).toMatchObject({ ready: true, loaded: false, error: 'load' });
  await store.reload();
  expect(store.getSnapshot().value.language).toBe('jp');
});
it.each([
  '{',
  JSON.stringify({ ...defaults, version: 2 }),
  JSON.stringify({ ...defaults, language: 'ja' }),
  JSON.stringify({ ...defaults, token: 'must-not-be-copied' }),
])('handles invalid/future data without silent overwrite: %s', async (raw) => {
  const { store, storage } = fixture(raw);
  await store.start();
  expect(store.getSnapshot()).toMatchObject({ error: 'load', loaded: false });
  expect(storage.write).not.toHaveBeenCalled();
  await store.reset();
  expect(store.getSnapshot()).toMatchObject({ value: defaults, error: null, loaded: true });
  expect(storage.write).toHaveBeenCalledWith(JSON.stringify(defaults));
});
it('persists across a real SQLite file close/reopen and reset leaves unrelated rows untouched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-preferences-'));
  let db = memoryDatabase(join(dir, 'prefs.db'));
  try {
    await db.execAsync(
      "CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES ('keep');"
    );
    const first = new PreferenceStore(await createPreferenceStorage(db));
    await first.start();
    await first.update({ language: 'zh', appearance: 'light' });
    db.close();
    db = memoryDatabase(join(dir, 'prefs.db'));
    const second = new PreferenceStore(await createPreferenceStorage(db));
    await second.start();
    expect(second.getSnapshot().value).toEqual({ version: 1, language: 'zh', appearance: 'light' });
    await second.reset();
    expect(await db.getAllAsync('SELECT * FROM unrelated')).toEqual([{ value: 'keep' }]);
    expect(await db.getAllAsync('SELECT value FROM device_preferences')).toEqual([
      { value: JSON.stringify(defaults) },
    ]);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
