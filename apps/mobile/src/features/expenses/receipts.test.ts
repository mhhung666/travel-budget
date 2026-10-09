import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReceiptReader } from './receipts';
import { ApiError } from '@/api/client';
const item = { id: 'a'.repeat(64), size: 123, contentType: 'image/png' as const };
const list = { ledger: { baseCurrency: 'TWD', moneyScale: 2 }, items: [item] };
const ticket = () => ({
  ...item,
  ledger: list.ledger,
  url: 'https://receipts.test/image?signature=x',
  expiresAt: Date.now() + 300000,
});
function setup() {
  const deps = {
    guard: vi.fn(async (): Promise<() => void> => () => {}),
    read: vi.fn(
      async (
        id: string | undefined,
        beforeSend: () => void,
        _signal: AbortSignal
      ): Promise<unknown> => {
        beforeSend();
        return id ? ticket() : list;
      }
    ),
    failure: vi.fn(async (_error: unknown) => {}),
    open: vi.fn(async (_url: string) => {}),
  };
  return { deps, reader: new ReceiptReader(deps) };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('loads metadata without signing or opening, and every view request is fresh', async () => {
  const { reader, deps } = setup();
  await reader.refresh();
  expect(reader.getSnapshot().list).toEqual(list);
  expect(deps.open).not.toHaveBeenCalled();
  await reader.open(item.id);
  const first = reader.getSnapshot().view!;
  reader.imageLoaded(first);
  expect(reader.getSnapshot().loadingImage).toBe(false);
  await reader.open(item.id);
  const second = reader.getSnapshot().view!;
  // Same-second signatures may be identical, but old image callbacks still cannot affect a new view.
  expect(second.url).toBe(first.url);
  reader.imageFailed(first);
  expect(reader.getSnapshot().view).toBe(second);
  reader.imageFailed(second);
  expect(reader.getSnapshot().view).toBeNull();
  expect(deps.read.mock.calls.map((c) => c[0])).toEqual([undefined, item.id, item.id]);
});
it('clears displayed URLs at expiry and never retries automatically', async () => {
  const { reader, deps } = setup();
  await reader.refresh();
  await reader.open(item.id);
  await vi.advanceTimersByTimeAsync(300000);
  expect(reader.getSnapshot()).toMatchObject({
    view: null,
    loadingImage: false,
    error: { code: 'ATTACHMENT_EXPIRED' },
  });
  expect(deps.read).toHaveBeenCalledTimes(2);
});
it('opens PDFs/external images only after a fresh authorized ticket, with URL only', async () => {
  const { reader, deps } = setup();
  await reader.refresh();
  await reader.open(item.id, true);
  expect(deps.open).toHaveBeenCalledWith(ticket().url);
  expect(reader.getSnapshot().view).toBeNull();
  deps.read.mockImplementation(async (id, check) => {
    check();
    return id
      ? { ...ticket(), contentType: 'application/pdf' }
      : { ...list, items: [{ ...item, contentType: 'application/pdf' }] };
  });
  await reader.refresh();
  await reader.open(item.id);
  expect(deps.open).toHaveBeenCalledTimes(2);
  expect(reader.getSnapshot().view).toBeNull();
});
it('cancels on blur/background and ignores a late view or list response', async () => {
  const { reader, deps } = setup();
  await reader.refresh();
  const pending = deferred<unknown>();
  deps.read.mockImplementationOnce(() => pending.promise);
  const work = reader.open(item.id, true);
  await Promise.resolve();
  await Promise.resolve();
  reader.cancel();
  pending.resolve(ticket());
  await work;
  expect(deps.open).not.toHaveBeenCalled();
  expect(reader.getSnapshot()).toMatchObject({ list: null, view: null, busy: false });
});
it('reruns the access guard after SQLite and on transport refresh replay', async () => {
  const { reader, deps } = setup();
  await reader.refresh();
  const check = vi.fn();
  deps.guard.mockResolvedValue(check);
  deps.read.mockImplementationOnce(async (_id, beforeSend) => {
    beforeSend();
    check.mockImplementation(() => {
      throw new ApiError('CANCELLED');
    });
    beforeSend();
    return ticket();
  });
  await reader.open(item.id, true);
  expect(deps.open).not.toHaveBeenCalled();
  expect(reader.getSnapshot().view).toBeNull();
  const pending = deferred<() => void>();
  deps.guard.mockImplementationOnce(() => pending.promise);
  const work = reader.refresh();
  reader.cancel();
  pending.resolve(() => {});
  await work;
  expect(deps.read).toHaveBeenCalledTimes(2);
});
it('does not let switched accounts or newer requests receive old content', async () => {
  const { reader, deps } = setup();
  await reader.refresh();
  let valid = true;
  deps.guard.mockResolvedValue(() => {
    if (!valid) throw new ApiError('CANCELLED');
  });
  deps.read.mockImplementationOnce(async () => {
    valid = false;
    return ticket();
  });
  await reader.open(item.id, true);
  expect(deps.open).not.toHaveBeenCalled();
  expect(reader.getSnapshot().view).toBeNull();
});
it('rejects expired, excessive lifetime, mismatched metadata/unit and unsafe links', async () => {
  const { reader, deps } = setup();
  await reader.refresh();
  for (const change of [
    { expiresAt: Date.now() },
    { expiresAt: Date.now() + 300001 },
    { id: 'b'.repeat(64) },
    { size: 999 },
    { ledger: { baseCurrency: 'USD', moneyScale: 2 } },
    { url: 'file:///private' },
  ]) {
    deps.read.mockResolvedValueOnce({ ...ticket(), ...change });
    await reader.open(item.id, true);
    expect(reader.getSnapshot().view).toBeNull();
    expect(reader.getSnapshot().error).toBeTruthy();
  }
  expect(deps.open).not.toHaveBeenCalled();
});
it('clears private data on denial and does not restore it on a later network failure', async () => {
  const { reader, deps } = setup();
  await reader.refresh();
  await reader.open(item.id);
  deps.read.mockRejectedValueOnce(new ApiError('NOT_FOUND', 404));
  await reader.open(item.id);
  expect(reader.getSnapshot()).toMatchObject({ view: null, list: null });
  deps.read.mockRejectedValueOnce(new ApiError('NETWORK'));
  await reader.refresh();
  expect(reader.getSnapshot()).toMatchObject({ view: null, list: null });
});
it('reports opening and durable rate-limit failures without keeping a ticket', async () => {
  const { reader, deps } = setup();
  await reader.refresh();
  deps.open.mockRejectedValueOnce(new Error('no browser'));
  await reader.open(item.id, true);
  expect(reader.getSnapshot().error).toBeTruthy();
  expect(reader.getSnapshot().view).toBeNull();
  const limit = new ApiError('RATE_LIMITED', 429, 120);
  deps.read.mockRejectedValueOnce(limit);
  deps.failure.mockRejectedValueOnce(new ApiError('STORAGE'));
  await reader.open(item.id);
  expect(deps.failure).toHaveBeenLastCalledWith(limit);
  expect(reader.getSnapshot()).toMatchObject({ error: { code: 'STORAGE' }, view: null });
});
