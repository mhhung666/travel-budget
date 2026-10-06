import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { TripEntry } from '@/features/tripEntry/engine';
import { memoryDatabase } from '@/test/sqlite';
import { createMutationStore, type MutationPayload } from '@/storage/mutations';
import { createPendingExpenseStore } from '@/storage/pendingExpenses';
const scope = { environment: 'https://example.test/api/v1', accountId: '111111111111111111111111' };
const tripId = '222222222222222222222222',
  paymentId = '333333333333333333333333',
  otherTrip = '444444444444444444444444';
const key = '11111111-1111-4111-8111-111111111111';
const body = {
  expected_revision: 'a'.repeat(64),
  from_id: scope.accountId,
  to_id: paymentId,
  amount: 20.01,
  note: 'partial',
};
const payload = { operation: 'payment.create' as const, tripId, body };
const committed = {
  status: 'committed' as const,
  operation: 'payment.create' as const,
  resourceId: paymentId,
  result: { tripId, paymentId, revision: 'b'.repeat(64) },
};
let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((f) => f());
  cleanup = [];
});
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'tb-e4-'));
  const path = join(dir, 'mutations.db');
  let db = memoryDatabase(path),
    store = await createMutationStore(db),
    now = 100000,
    version = 0;
  const request = vi.fn(
    async (
      _user: string,
      _path: string,
      _schema: unknown,
      options?: { method?: string; body?: unknown; beforeSend?: () => void }
    ) => {
      options?.beforeSend?.();
      return options?.method ? committed.result : committed;
    }
  );
  const engine = () =>
    new TripEntry({
      store: async () => store,
      request: request as never,
      newId: () => key,
      active: (s) => s.accountId === scope.accountId && s.environment === scope.environment,
      now: () => now,
      guard: () => {
        const captured = version;
        return () => {
          if (version !== captured) throw new ApiError('CANCELLED');
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
    set now(v: number) {
      now = v;
    },
    set version(v: number) {
      version = v;
    },
    async restart() {
      db.close();
      db = memoryDatabase(path);
      store = await createMutationStore(db);
    },
  };
}
it.each(['payment.create', 'payment.delete'] as const)(
  '%s lost response/reopen resolves only original UUID without another write',
  async (operation) => {
    const h = await fixture();
    const input =
      operation === 'payment.create'
        ? payload
        : { operation, tripId, paymentId, body: { expected_revision: body.expected_revision } };
    const terminal =
      operation === 'payment.create'
        ? committed
        : { ...committed, operation, result: { tripId, paymentId, deleted: true } };
    h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
    expect((await h.engine().confirm(scope, input)).kind).toBe('pending');
    const call = h.request.mock.calls[0];
    expect(call?.[1]).toBe(
      `/trips/${tripId}/payments${operation === 'payment.delete' ? `/${paymentId}` : ''}`
    );
    expect(call?.[3]?.method).toBe(operation === 'payment.create' ? 'POST' : 'DELETE');
    await h.restart();
    h.request.mockResolvedValueOnce(terminal as never);
    await h.engine().recover(scope);
    expect(h.request.mock.calls.filter((c) => c[3]?.method)).toHaveLength(1);
    expect((await h.store.list(scope))[0]).toMatchObject({
      status: 'completed',
      payload: null,
      result: terminal,
    });
  }
);
it('save failure sends nothing; explicit crash recovery first queries, then sends identical body/key', async () => {
  const h = await fixture();
  vi.spyOn(h.store, 'insert').mockRejectedValueOnce(new Error('disk full'));
  expect((await h.engine().confirm(scope, payload)).kind).toBe('not-sent');
  expect(h.request).not.toHaveBeenCalled();
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  await h.engine().confirm(scope, payload);
  await h.restart();
  h.request.mockResolvedValueOnce({ status: 'not_found' } as never);
  await h.engine().retry(scope, key);
  expect(h.request.mock.calls[1]?.[1]).toBe(`/mutation-requests/${key}`);
  expect(h.request.mock.calls.at(-1)?.[3]?.body).toEqual({ ...body, client_request_id: key });
});
it('terminal settlement conflict retains input across restart and releases same-trip lock', async () => {
  const h = await fixture();
  h.request.mockRejectedValueOnce(new ApiError('SETTLEMENT_CHANGED', 409)).mockResolvedValueOnce({
    status: 'rejected',
    operation: 'payment.create',
    code: 'SETTLEMENT_CHANGED',
    tripId,
  } as never);
  expect((await h.engine().confirm(scope, payload)).kind).toBe('completed');
  await h.restart();
  expect((await h.store.get(scope, key))?.payload).toMatchObject({
    ...payload,
    body: { ...body, client_request_id: key },
  });
  expect(
    await h.store.insert({
      ...scope,
      tripId,
      operation: 'payment.delete',
      clientRequestId: '22222222-2222-4222-8222-222222222222',
      payload: {
        operation: 'payment.delete',
        tripId,
        paymentId,
        body: {
          client_request_id: '22222222-2222-4222-8222-222222222222',
          expected_revision: body.expected_revision,
        },
      },
      status: 'pending',
      conflict: false,
      result: null,
      createdAt: 1,
    })
  ).toBe(true);
});
it('409 and account-wide 429 remain distinct after restart; other-trip operations respect full deadline', async () => {
  const h = await fixture();
  h.request
    .mockRejectedValueOnce(new ApiError('IDEMPOTENCY_CONFLICT', 409))
    .mockRejectedValueOnce(new ApiError('BUSY', 429, 120));
  await h.engine().confirm(scope, payload);
  await h.restart();
  h.now = 131000;
  expect((await h.store.get(scope, key))?.conflict).toBe(true);
  const before = h.request.mock.calls.length;
  expect((await h.engine().confirm(scope, { ...payload, tripId: otherTrip })).kind).toBe(
    'not-sent'
  );
  await h.engine().lookup(scope, key);
  expect(h.request).toHaveBeenCalledTimes(before);
  expect(await h.store.retryAt(scope)).toBe(220000);
});
it('C/E3/E4 atomic coordination blocks same trip; another trip can still prepare', async () => {
  const h = await fixture();
  h.request.mockRejectedValue(new ApiError('NETWORK'));
  await h.engine().confirm(scope, payload);
  const fields = {
    client_request_id: '22222222-2222-4222-8222-222222222222',
    payer_id: scope.accountId,
    original_amount: 1,
    currency: 'TWD' as const,
    exchange_rate: 1 as const,
    description: 'meal',
    category: 'food' as const,
    date: '2026-10-06',
    splits: [{ user_id: scope.accountId, share_amount: 1 }],
  };
  const c = await createPendingExpenseStore(h.db);
  const record = {
    ...scope,
    tripId,
    clientRequestId: fields.client_request_id,
    payload: fields,
    status: 'sending' as const,
    createdAt: 1,
    updatedAt: 1,
  };
  await expect(c.insert(record)).rejects.toThrow();
  const e3: MutationPayload = {
    operation: 'expense.delete',
    tripId,
    expenseId: paymentId,
    body: {
      client_request_id: fields.client_request_id,
      expected_revision: body.expected_revision,
    },
  };
  expect(
    await h.store.insert({
      ...scope,
      tripId,
      clientRequestId: fields.client_request_id,
      operation: e3.operation,
      payload: e3,
      status: 'pending',
      conflict: false,
      result: null,
      createdAt: 1,
    })
  ).toBe(false);
  await c.insert({ ...record, tripId: otherTrip });
  expect(await c.list(scope, otherTrip)).toHaveLength(1);
});
it('account/environment isolation and revocation during storage await prevent transport', async () => {
  const h = await fixture();
  const insert = h.store.insert;
  vi.spyOn(h.store, 'insert').mockImplementation(async (r) => {
    const saved = await insert(r);
    h.version = 1;
    return saved;
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  expect(h.request).not.toHaveBeenCalled();
  await h.restart();
  expect(await h.store.list({ ...scope, accountId: otherTrip })).toEqual([]);
  expect(await h.store.list({ ...scope, environment: 'https://other.test/api/v1' })).toEqual([]);
  expect((await h.engine().lookup({ ...scope, accountId: otherTrip }, key)).kind).toBe('blocked');
  expect(h.request).not.toHaveBeenCalled();
});
it('read refresh failure after committed receipt remains success without replaying write', async () => {
  const h = await fixture();
  const engine = new TripEntry({
    store: async () => h.store,
    request: h.request as never,
    newId: () => key,
    active: () => true,
    committed: async () => {
      throw new Error('read failure');
    },
  });
  expect(await engine.confirm(scope, payload)).toMatchObject({
    kind: 'completed',
    refreshed: false,
  });
  expect((await h.store.get(scope, key))?.status).toBe('completed');
});
