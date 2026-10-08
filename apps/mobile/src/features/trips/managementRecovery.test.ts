import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { memoryDatabase } from '@/test/sqlite';
import { createMutationStore } from '@/storage/mutations';
import { createPendingExpenseStore } from '@/storage/pendingExpenses';
import { TripEntry } from '@/features/tripEntry/engine';
const scope = { environment: 'https://test/api/v1', accountId: 'a'.repeat(24) },
  tripId = 'b'.repeat(24),
  key = '11111111-1111-4111-8111-111111111111',
  revision = 'c'.repeat(64);
const currencyPayload = {
  operation: 'trip.currency' as const,
  tripId,
  body: {
    expected_revision: revision,
    settings: { default_currency: 'JPY', currencies: [{ code: 'JPY', rate: 0.2156789012345 }] },
  },
};
const updatePayload = {
  operation: 'trip.update' as const,
  tripId,
  body: { expected_revision: revision, changes: { name: 'User edit' } },
};
let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
});
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'tb-g1-'));
  const path = join(dir, 'pending.db');
  let db = memoryDatabase(path),
    store = await createMutationStore(db),
    now = 100000;
  let version = 0;
  const request = vi.fn();
  const engine = () =>
    new TripEntry({
      store: async () => store,
      request,
      newId: () => key,
      active: () => true,
      now: () => now,
      guard: () => {
        const v = version;
        return () => {
          if (v !== version) throw new ApiError('CANCELLED');
        };
      },
    });
  cleanup.push(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    engine,
    request,
    get store() {
      return store;
    },
    get db() {
      return db;
    },
    set now(n: number) {
      now = n;
    },
    set version(n: number) {
      version = n;
    },
    async restart() {
      db.close();
      db = memoryDatabase(path);
      store = await createMutationStore(db);
    },
  };
}
it.each(['trip.update', 'trip.archive', 'trip.currency'] as const)(
  '%s persists before sending and crash recovery only queries its original UUID',
  async (operation) => {
    const h = await fixture();
    const input =
      operation === 'trip.currency'
        ? currencyPayload
        : operation === 'trip.update'
          ? updatePayload
          : { operation, tripId, body: { expected_revision: revision, archived: true } };
    const result = operation !== 'trip.archive' ? { tripId, revision } : { tripId, archived: true };
    h.request.mockImplementationOnce(async (_user, path, _schema, options) => {
      expect((await h.store.list(scope))[0].payload?.operation).toBe(operation);
      expect(path).toBe(
        operation === 'trip.currency'
          ? `/trips/${tripId}/currency-settings`
          : operation === 'trip.update'
            ? `/trips/${tripId}`
            : `/trips/${tripId}/archive`
      );
      expect(options?.method).toBe(operation === 'trip.update' ? 'PATCH' : 'POST');
      throw new ApiError('NETWORK');
    });
    expect((await h.engine().confirm(scope, input)).kind).toBe('pending');
    await h.restart();
    h.request.mockResolvedValue({ status: 'committed', operation, resourceId: tripId, result });
    await h.engine().recover(scope);
    expect(h.request.mock.calls[1][1]).toBe(`/mutation-requests/${key}`);
    expect((await h.store.list(scope))[0]).toMatchObject({ status: 'completed', payload: null });
    expect(await h.store.list({ ...scope, accountId: 'd'.repeat(24) })).toEqual([]);
    expect(await h.store.list({ ...scope, environment: 'https://other/api/v1' })).toEqual([]);
  }
);
it.each([updatePayload, currencyPayload])(
  'storage insert failure prevents the confirmed HTTP write ($operation)',
  async (payload) => {
    const h = await fixture();
    vi.spyOn(h.store, 'insert').mockRejectedValueOnce(new Error('disk full'));
    expect((await h.engine().confirm(scope, payload)).kind).toBe('not-sent');
    expect(h.request).not.toHaveBeenCalled();
  }
);
it.each([updatePayload, currencyPayload])(
  'receipt conflict retains only intended edits for explicit rebase, no new UUID retry ($operation)',
  async (payload) => {
    const h = await fixture();
    const result = {
      status: 'rejected',
      operation: payload.operation,
      tripId,
      code: 'RESOURCE_CHANGED',
    };
    h.request
      .mockRejectedValueOnce(new ApiError('RESOURCE_CHANGED', 409))
      .mockResolvedValue(result);
    expect((await h.engine().confirm(scope, payload)).kind).toBe('completed');
    await h.restart();
    expect((await h.store.list(scope))[0].payload).toMatchObject(payload);
    h.request.mockClear();
    await h.engine().retry(scope, key);
    expect(h.request).not.toHaveBeenCalled();
  }
);
it.each([updatePayload, currencyPayload])(
  'lost admin is terminal and readable without falsely hiding membership ($operation)',
  async (payload) => {
    const h = await fixture();
    h.request.mockRejectedValueOnce(new ApiError('FORBIDDEN', 403)).mockResolvedValue({
      status: 'rejected',
      operation: payload.operation,
      tripId,
      code: 'FORBIDDEN',
    });
    const outcome = await h.engine().confirm(scope, payload);
    expect(outcome).toMatchObject({ kind: 'completed', result: { code: 'FORBIDDEN' } });
  }
);
it.each([updatePayload, currencyPayload])(
  '429 stays persisted across restart and blocks another trip until its original deadline ($operation)',
  async (payload) => {
    const h = await fixture();
    h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
    expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
    await h.restart();
    h.now = 131000;
    expect((await h.engine().confirm(scope, { ...payload, tripId: 'd'.repeat(24) })).kind).toBe(
      'not-sent'
    );
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(await h.store.retryAt(scope)).toBe(220000);
  }
);
it.each([updatePayload, currencyPayload])(
  'same-trip C and G confirmation are coordinated atomically; another trip may continue ($operation)',
  async (payload) => {
    const h = await fixture();
    const pending = await createPendingExpenseStore(h.db);
    const record = {
      ...scope,
      tripId,
      clientRequestId: '22222222-2222-4222-8222-222222222222',
      payload: {
        client_request_id: '22222222-2222-4222-8222-222222222222',
        payer_id: scope.accountId,
        original_amount: 1,
        currency: 'TWD' as const,
        exchange_rate: 1 as const,
        description: 'meal',
        category: 'food' as const,
        date: '2026-10-08',
        splits: [{ user_id: scope.accountId, share_amount: 1 }],
      },
      status: 'sending' as const,
      createdAt: 0,
      updatedAt: 0,
      conflict: false,
    };
    await pending.insert(record);
    expect((await h.engine().confirm(scope, payload)).kind).toBe('blocked');
    expect(h.request).not.toHaveBeenCalled();
    h.request.mockResolvedValue({ tripId: 'd'.repeat(24), revision });
    expect((await h.engine().confirm(scope, { ...payload, tripId: 'd'.repeat(24) })).kind).toBe(
      'completed'
    );
  }
);
it.each([updatePayload, currencyPayload])(
  'login generation changed in SQLite wait prevents all sending ($operation)',
  async (payload) => {
    const h = await fixture();
    const insert = h.store.insert.bind(h.store);
    vi.spyOn(h.store, 'insert').mockImplementationOnce(async (record) => {
      const result = await insert(record);
      h.version = 1;
      return result;
    });
    expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
    expect(h.request).not.toHaveBeenCalled();
  }
);
it.each([updatePayload, currencyPayload])(
  'unchanged original body and UUID are used after lookup confirms not_found ($operation)',
  async (payload) => {
    const h = await fixture();
    h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
    await h.engine().confirm(scope, payload);
    await h.restart();
    h.request
      .mockResolvedValueOnce({ status: 'not_found' })
      .mockResolvedValueOnce({ tripId, revision });
    await h.engine().retry(scope, key);
    expect(h.request.mock.calls[2][3]?.body).toEqual({ ...payload.body, client_request_id: key });
  }
);
it('existing schema 8 G1 rows and G2a intents coexist after restart without a migration', async () => {
  const h = await fixture();
  h.request.mockRejectedValue(new ApiError('NETWORK'));
  await h.engine().confirm(scope, updatePayload);
  const otherTrip = 'd'.repeat(24);
  await h.store.insert({
    ...scope,
    clientRequestId: '22222222-2222-4222-8222-222222222222',
    operation: 'trip.currency',
    payload: {
      ...currencyPayload,
      tripId: otherTrip,
      body: { ...currencyPayload.body, client_request_id: '22222222-2222-4222-8222-222222222222' },
    },
    result: null,
    tripId: otherTrip,
    status: 'pending',
    conflict: false,
    createdAt: 1,
  });
  await h.restart();
  expect((await h.store.list(scope)).map((r) => r.payload?.operation).sort()).toEqual([
    'trip.currency',
    'trip.update',
  ]);
  expect(await h.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 8 });
});
