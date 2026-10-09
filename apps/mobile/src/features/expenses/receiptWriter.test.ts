import { afterEach, expect, it, vi } from 'vitest';
import { memoryDatabase } from '@/test/sqlite';
import { createReceiptWriteStore } from '@/storage/receiptWrites';
import { ApiError } from '@/api/client';
import { ReceiptWriter } from './receiptWriter';
import type { EntryRequest } from './entry';
const scope = { environment: 'https://test', accountId: 'a'.repeat(24) };
const tripId = 'b'.repeat(24),
  expenseId = 'c'.repeat(24),
  uuid = '11111111-1111-4111-8111-111111111111';
const input = {
  action: 'add' as const,
  client_request_id: uuid,
  contentType: 'image/jpeg' as const,
  size: 100,
};
const state = (status: 'not_found' | 'pending' | 'committed' | 'rejected') => ({
  status,
  clientRequestId: uuid,
  ledger: { baseCurrency: 'USD' as const, moneyScale: 2 as const },
});
const dbs: ReturnType<typeof memoryDatabase>[] = [];
afterEach(() => dbs.splice(0).forEach((d) => d.close()));
async function setup() {
  const db = memoryDatabase();
  dbs.push(db);
  const store = await createReceiptWriteStore(db);
  let server = state('not_found'),
    uploaded = false;
  const calls: string[] = [];
  const request = vi.fn(async (_account, path, _schema, options) => {
    options?.beforeSend?.();
    const action = (options?.body as { action?: string } | undefined)?.action;
    calls.push(action ?? 'lookup');
    if (!options?.method) return server;
    if (path.endsWith('attachment-requests')) {
      server = state('pending');
      return server;
    }
    if (action === 'finish') {
      if (!uploaded) throw new ApiError('UPLOAD_INCOMPLETE', 409, undefined, 'request');
      server = state('committed');
      return server;
    }
    if (action === 'cancel') {
      server = state('rejected');
      return server;
    }
    return {
      ...server,
      upload: {
        url: 'https://files.test/upload',
        contentType: 'image/jpeg',
        expiresAt: Date.now() + 120000,
      },
    };
  }) as unknown as ReturnType<typeof vi.fn<EntryRequest>>;
  const check = vi.fn();
  const upload = vi.fn(async () => {
    uploaded = true;
  });
  const removeFile = vi.fn(async () => {});
  const failure = vi.fn(async () => {});
  const deps = {
    scope,
    tripId,
    expenseId,
    store: async () => store,
    guard: async () => check,
    request: request as EntryRequest,
    upload,
    removeFile,
    failure,
  };
  return {
    store,
    calls,
    deps,
    request,
    check,
    upload,
    removeFile,
    failure,
    writer: new ReceiptWriter(deps),
  };
}
it('persists before network, commits after HEAD and keeps exactly one UUID', async () => {
  const h = await setup();
  h.check.mockImplementation(async () => {});
  await h.writer.confirm(input, uuid);
  expect(h.calls).toEqual(['lookup', 'add', 'finish', 'upload', 'finish']);
  expect(h.writer.getSnapshot().record?.result?.status).toBe('committed');
  expect((await h.store.list(scope))[0].input).toEqual(input);
  expect(h.removeFile).toHaveBeenCalledWith(uuid);
  await h.writer.retry();
  expect(h.calls).toHaveLength(5);
  await h.writer.dismiss();
  expect(await h.store.list(scope)).toEqual([]);
});
it('does not send when SQLite insert fails or a frozen operation already exists', async () => {
  const h = await setup();
  await h.store.insert(scope, {
    tripId,
    expenseId,
    input,
    file: uuid,
    cancel: false,
    result: null,
  });
  await h.writer.confirm(
    { ...input, client_request_id: '22222222-2222-4222-8222-222222222222' },
    uuid
  );
  expect(h.request).not.toHaveBeenCalled();
  expect((await h.store.list(scope))[0].input.client_request_id).toBe(uuid);
});
it('restarts by lookup only; a lost PUT response finishes without reuploading', async () => {
  const h = await setup();
  const upload = h.deps.upload;
  h.deps.upload = vi.fn(async () => {
    await upload();
    throw new Error('response lost');
  });
  const first = new ReceiptWriter(h.deps);
  await first.confirm(input, uuid);
  expect(first.getSnapshot().record?.result).toBeNull();
  const restarted = new ReceiptWriter(h.deps);
  await restarted.load();
  expect(h.calls.at(-1)).toBe('lookup');
  await restarted.retry();
  expect(h.deps.upload).toHaveBeenCalledTimes(1);
  expect(restarted.getSnapshot().record?.result?.status).toBe('committed');
});
it('keeps ambiguity through failed terminal saves and file deletion; retry never creates a new UUID', async () => {
  const h = await setup();
  const save = h.store.save;
  h.store.save = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockImplementation(save);
  await h.writer.confirm(input, uuid);
  expect(h.writer.getSnapshot().record?.result).toBeNull();
  await h.writer.retry();
  expect(h.calls.filter((c) => c === 'add')).toHaveLength(1);
  h.removeFile.mockRejectedValueOnce(new Error('cannot delete'));
  await h.writer.dismiss();
  expect(await h.store.list(scope)).toHaveLength(1);
  await h.writer.dismiss();
  expect(await h.store.list(scope)).toHaveLength(0);
});
it('persists cancellation before sending and retries cancellation after restart', async () => {
  const h = await setup();
  h.upload.mockRejectedValue(new Error('offline'));
  await h.writer.confirm(input, uuid);
  h.check.mockImplementationOnce(() => {
    throw new ApiError('CANCELLED');
  });
  await h.writer.cancel();
  expect((await h.store.list(scope))[0].cancel).toBe(true);
  const restarted = new ReceiptWriter(h.deps);
  await restarted.load();
  await restarted.retry();
  expect(restarted.getSnapshot().record?.result?.status).toBe('rejected');
  expect(h.upload).toHaveBeenCalledTimes(1);
});
it('guards every transport including refresh replay and retains original record on 429', async () => {
  const h = await setup();
  h.request.mockImplementationOnce(async (_a, _p, _s, options) => {
    options?.beforeSend?.();
    h.check.mockImplementation(() => {
      throw new ApiError('RATE_LIMITED', 429);
    });
    options?.beforeSend?.();
    return state('not_found') as never;
  });
  await h.writer.confirm(input, uuid);
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(h.failure).toHaveBeenCalled();
  expect((await h.store.list(scope))[0].input.client_request_id).toBe(uuid);
});
it('isolates account/environment rows and preserves immutable body on duplicate inserts', async () => {
  const h = await setup();
  await h.store.insert(scope, {
    tripId,
    expenseId,
    input,
    file: uuid,
    cancel: false,
    result: null,
  });
  expect(await h.store.list({ ...scope, accountId: 'd'.repeat(24) })).toEqual([]);
  expect(await h.store.list({ ...scope, environment: 'https://other' })).toEqual([]);
  expect(await h.store.files()).toEqual([uuid]);
  await expect(
    h.store.insert(scope, { tripId, expenseId, input, cancel: false, result: null })
  ).rejects.toThrow();
});
