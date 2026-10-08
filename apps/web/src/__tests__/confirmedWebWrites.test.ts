import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  bindConfirmedWebWrites,
  stopConfirmedWebWrites,
  confirmWebWrite,
  readConfirmedWebWrites,
  resumeConfirmedWebWrite,
  type ConfirmedWebWrite,
} from '@/lib/confirmedWebWrites';
const h = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  save: vi.fn(),
  lookup: vi.fn(),
  write: vi.fn(),
}));
vi.mock('idb-keyval', () => ({
  get: async (key: string) => structuredClone(h.storage.get(key)),
  update: async (key: string, fn: (old: unknown) => unknown) => {
    await h.save();
    h.storage.set(key, structuredClone(fn(h.storage.get(key))));
  },
}));
vi.mock('@/actions', () => ({
  getLedgerMutation: h.lookup,
  writeWebPayment: h.write,
  createLedgerTrip: h.write,
  joinLedgerTrip: h.write,
  writeWebTripSettings: h.write,
  updateLedgerExpense: h.write,
  deleteLedgerExpense: h.write,
}));
const tripId = '0123456789abcdef01234567';
const client = (scope = 'local:actor') => {
  const c = new QueryClient();
  bindConfirmedWebWrites(c, scope);
  return c;
};
const request = (): Extract<
  ConfirmedWebWrite,
  { operation: 'payment.create' | 'payment.delete' }
> => ({
  operation: 'payment.create',
  tripId,
  body: {
    client_request_id: crypto.randomUUID(),
    base_currency: 'USD',
    expected_revision: 'a'.repeat(64),
    from_id: '0123456789abcdef01234568',
    to_id: '0123456789abcdef01234569',
    amount: 2.01,
    note: '',
  },
});
beforeEach(() => {
  h.storage.clear();
  vi.clearAllMocks();
  h.save.mockResolvedValue(undefined);
  h.lookup.mockResolvedValue({ success: true, data: { status: 'not_found' } });
  h.write.mockResolvedValue({ success: true, data: { tripId, paymentId: 'payment' } });
});
describe('confirmed Web ledger journal', () => {
  it('cannot send when durable saving fails', async () => {
    h.save.mockRejectedValueOnce(new Error('quota'));
    await expect(confirmWebWrite(client(), request())).rejects.toThrow('quota');
    expect(h.lookup).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });
  it('recovers a lost response after reload by querying the original UUID, without sending again', async () => {
    const c = client(),
      r = request();
    h.write.mockRejectedValueOnce(new TypeError('response lost'));
    await expect(confirmWebWrite(c, r)).rejects.toThrow('response lost');
    const entry = Object.values(await readConfirmedWebWrites(client()))[0];
    expect(entry.request).toEqual(r);
    h.lookup.mockResolvedValueOnce({
      success: true,
      data: {
        status: 'committed',
        operation: 'payment.create',
        result: { tripId, paymentId: 'payment' },
        ledger: { baseCurrency: 'USD', moneyScale: 2 },
      },
    });
    await resumeConfirmedWebWrite(client(), entry);
    expect(h.lookup).toHaveBeenLastCalledWith(r.body.client_request_id);
    expect(h.write).toHaveBeenCalledOnce();
    expect(Object.values(await readConfirmedWebWrites(client()))[0].status).toBe('done');
  });
  it('freezes an ambiguous request and blocks a second UUID for the same trip', async () => {
    const c = client();
    h.write.mockRejectedValueOnce(new TypeError('offline'));
    await expect(confirmWebWrite(c, request())).rejects.toThrow('offline');
    await expect(confirmWebWrite(c, request())).rejects.toThrow('ledger.pendingWrite');
    expect(h.write).toHaveBeenCalledOnce();
  });
  it('does not expose a journal to another account or environment', async () => {
    h.write.mockRejectedValueOnce(new TypeError('offline'));
    await expect(confirmWebWrite(client(), request())).rejects.toThrow();
    expect(await readConfirmedWebWrites(client('local:other'))).toEqual({});
    expect(await readConfirmedWebWrites(client('different-environment:actor'))).toEqual({});
  });
  it('stops between receipt lookup and sending when the account logs out', async () => {
    const c = client();
    h.lookup.mockImplementationOnce(async () => {
      stopConfirmedWebWrites(c);
      return { success: true, data: { status: 'not_found' } };
    });
    await expect(confirmWebWrite(c, request())).rejects.toThrow('UNAUTHORIZED');
    expect(h.write).not.toHaveBeenCalled();
  });
  it('keeps a conflict terminal and permits a newly confirmed intent', async () => {
    h.lookup.mockResolvedValueOnce({
      success: true,
      data: { status: 'rejected', operation: 'payment.create', code: 'SETTLEMENT_CHANGED' },
    });
    const c = client();
    await expect(confirmWebWrite(c, request())).rejects.toThrow('SETTLEMENT_CHANGED');
    await confirmWebWrite(c, request());
    expect(h.write).toHaveBeenCalledOnce();
  });
  it('validates precision before durable confirmation', async () => {
    const r = request();
    r.body.amount = 0.001;
    await expect(confirmWebWrite(client(), r)).rejects.toThrow();
    expect(h.save).not.toHaveBeenCalled();
  });
});

it.each(['lookup', 'write'] as const)(
  'persists account-wide 429 waiting from %s and preserves it across reload',
  async (origin) => {
    const r = request(),
      c = client();
    h[origin].mockResolvedValueOnce({
      success: false,
      error: 'BUSY',
      code: 'BUSY',
      retryAfter: 120,
    });
    await expect(confirmWebWrite(c, r)).rejects.toThrow('BUSY');
    const other = request();
    other.tripId = '0123456789abcdef01234570';
    await expect(confirmWebWrite(client(), other)).rejects.toThrow('ledger.wait');
    expect(h.write).toHaveBeenCalledTimes(origin === 'write' ? 1 : 0);
  }
);
it('retains the original wait in memory when saving the cooldown fails', async () => {
  const c = client();
  h.lookup.mockImplementationOnce(async () => {
    h.save.mockRejectedValueOnce(new Error('quota'));
    return { success: false, error: 'BUSY', code: 'BUSY', retryAfter: 120 };
  });
  await expect(confirmWebWrite(c, request())).rejects.toThrow('quota');
  await expect(confirmWebWrite(c, request())).rejects.toThrow('ledger.wait');
  expect(h.write).not.toHaveBeenCalled();
});
it('refuses a receipt for a different operation or ledger without retiring the original UUID', async () => {
  const c = client(),
    r = request();
  h.lookup.mockResolvedValueOnce({
    success: true,
    data: {
      status: 'committed',
      operation: 'expense.delete',
      ledger: { baseCurrency: 'USD', moneyScale: 2 },
      result: { tripId },
    },
  });
  await expect(confirmWebWrite(c, r)).rejects.toThrow('LEDGER_DATA_INVALID');
  h.lookup.mockResolvedValueOnce({
    success: true,
    data: {
      status: 'committed',
      operation: r.operation,
      ledger: { baseCurrency: 'TWD', moneyScale: 2 },
      result: { tripId },
    },
  });
  await expect(
    resumeConfirmedWebWrite(c, Object.values(await readConfirmedWebWrites(c))[0])
  ).rejects.toThrow('LEDGER_DATA_INVALID');
  expect(h.write).not.toHaveBeenCalled();
  expect(Object.values(await readConfirmedWebWrites(c))[0].status).toBe('pending');
});
it('shares an atomic trip reservation with an existing create-expense sender across reload', async () => {
  const { claimWebTripWrite, releaseWebTripWrite } = await import('@/lib/webWriteCoordination');
  const c = client(),
    uuid = crypto.randomUUID();
  await claimWebTripWrite(c, tripId, uuid);
  const r = request();
  await expect(confirmWebWrite(c, r)).rejects.toThrow('ledger.pendingWrite');
  expect(h.lookup).not.toHaveBeenCalled();
  expect(h.write).not.toHaveBeenCalled();
  await releaseWebTripWrite(c, uuid);
  const reloaded = client();
  await resumeConfirmedWebWrite(reloaded, Object.values(await readConfirmedWebWrites(reloaded))[0]);
  expect(h.write).toHaveBeenCalledOnce();
});
it('quarantines malformed storage and preserves it without sending', async () => {
  const c = client(),
    key = 'travel-budget-confirmed-v2:local%3Aactor';
  h.storage.set(key, { broken: { version: 1, status: 'pending' } });
  await expect(confirmWebWrite(c, request())).rejects.toThrow('ledger.storageInvalid');
  expect(h.storage.get(key)).toEqual({ broken: { version: 1, status: 'pending' } });
  expect(h.lookup).not.toHaveBeenCalled();
});
it('does not confirm a new operation while offline or replace a saved intent', async () => {
  const { onlineManager } = await import('@tanstack/react-query');
  const online = vi.spyOn(onlineManager, 'isOnline').mockReturnValue(false);
  try {
    await expect(confirmWebWrite(client(), request())).rejects.toThrow('ledger.onlineOnly');
    expect(h.save).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  } finally {
    online.mockRestore();
  }
});
it.each(['failed', 'done'] as const)(
  'heals a C reservation left after durable %s when the tab closed before releasing it',
  async (status) => {
    const c = client(),
      oldId = crypto.randomUUID();
    const { claimWebTripWrite } = await import('@/lib/webWriteCoordination');
    await claimWebTripWrite(c, tripId, oldId);
    h.storage.set('travel-budget-expense-outbox:local%3Aactor', {
      [oldId]: { status, vars: { input: { client_request_id: oldId } } },
    });
    await confirmWebWrite(client(), request());
    expect(h.write).toHaveBeenCalledOnce();
  }
);
it('heals an E reservation left after a durable terminal without expiring a pending operation', async () => {
  const c = client(),
    r = request();
  h.write.mockRejectedValueOnce(new TypeError('offline'));
  await expect(confirmWebWrite(c, r)).rejects.toThrow();
  const entries = await readConfirmedWebWrites(c);
  entries[r.body.client_request_id].status = 'done';
  h.storage.set('travel-budget-confirmed-v2:local%3Aactor', entries);
  await confirmWebWrite(client(), request());
  expect(h.write).toHaveBeenCalledTimes(2);
});

it.each([
  'INVITATION_INVALID',
  'FEATURE_NOT_AVAILABLE',
  'RESOURCE_CHANGED',
  'RESOURCE_GONE',
  'SETTLEMENT_CHANGED',
  'LEDGER_CURRENCY_MISMATCH',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'FORBIDDEN',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
])(
  'retires an explicit %s write refusal across reload and releases the trip reservation',
  async (code) => {
    const c = client(),
      r = request();
    h.write.mockResolvedValueOnce({ success: false, error: 'localized refusal', code });
    await expect(confirmWebWrite(c, r)).rejects.toThrow('localized refusal');
    const reloaded = client();
    const entry = (await readConfirmedWebWrites(reloaded))[r.body.client_request_id];
    expect(entry.status).toBe('rejected');
    await expect(resumeConfirmedWebWrite(reloaded, entry)).rejects.toThrow('localized refusal');
    await confirmWebWrite(reloaded, request());
    expect(h.write).toHaveBeenCalledTimes(2);
  }
);
it('permits correcting an invalid invitation with a fresh confirmed UUID', async () => {
  const c = client();
  const join = (invite_code: string): ConfirmedWebWrite => ({
    operation: 'trip.join',
    body: { client_request_id: crypto.randomUUID(), invite_code },
  });
  h.write.mockResolvedValueOnce({
    success: false,
    error: 'INVITATION_INVALID',
    code: 'INVITATION_INVALID',
  });
  await expect(confirmWebWrite(c, join('badcode1'))).rejects.toThrow('INVITATION_INVALID');
  await confirmWebWrite(client(), join('goodcode'));
  expect(h.write).toHaveBeenCalledTimes(2);
});
it('never retires an ambiguous write merely because its receipt lookup is denied', async () => {
  const c = client(),
    r = request();
  h.write.mockRejectedValueOnce(new TypeError('lost response'));
  await expect(confirmWebWrite(c, r)).rejects.toThrow();
  h.lookup.mockResolvedValueOnce({ success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' });
  await expect(
    resumeConfirmedWebWrite(c, (await readConfirmedWebWrites(c))[r.body.client_request_id])
  ).rejects.toThrow('FORBIDDEN');
  expect((await readConfirmedWebWrites(c))[r.body.client_request_id].status).toBe('pending');
  expect(h.write).toHaveBeenCalledOnce();
});
it('keeps an explicit refusal pending if saving its terminal fails, then recovers with the same UUID', async () => {
  const c = client(),
    r = request();
  h.write.mockImplementationOnce(async () => {
    h.save.mockRejectedValueOnce(new Error('quota'));
    return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
  });
  await expect(confirmWebWrite(c, r)).rejects.toThrow('quota');
  const entry = (await readConfirmedWebWrites(c))[r.body.client_request_id];
  expect(entry.status).toBe('pending');
  h.write.mockResolvedValueOnce({
    success: false,
    error: 'VALIDATION_ERROR',
    code: 'VALIDATION_ERROR',
  });
  await expect(resumeConfirmedWebWrite(client(), entry)).rejects.toThrow('VALIDATION_ERROR');
  expect(h.lookup).toHaveBeenLastCalledWith(r.body.client_request_id);
  expect((await readConfirmedWebWrites(client()))[r.body.client_request_id].status).toBe(
    'rejected'
  );
});
