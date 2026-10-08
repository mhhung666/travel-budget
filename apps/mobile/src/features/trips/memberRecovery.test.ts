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
const ledger = { baseCurrency: 'TWD', moneyScale: 2 as const };
const payload = {
  operation: 'member.create' as const,
  tripId,
  body: { expected_revision: revision, display_name: 'Virtual' },
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
const memberId = 'd'.repeat(24);
it.each(['member.create', 'member.rename'] as const)(
  '%s persists before sending; restart retrieves the original receipt without repeating the write',
  async (operation) => {
    const h = await fixture();
    const input = operation === 'member.create' ? payload : { ...payload, operation, memberId };
    h.request.mockImplementationOnce(async (_actor, path, _schema, options) => {
      expect((await h.store.list(scope))[0].payload).toMatchObject(input);
      expect(path).toBe(
        `/trips/${tripId}/members${operation === 'member.rename' ? `/${memberId}` : ''}`
      );
      expect(options.method).toBe(operation === 'member.rename' ? 'PATCH' : 'POST');
      throw new ApiError('NETWORK');
    });
    expect((await h.engine().confirm(scope, input)).kind).toBe('pending');
    await h.restart();
    h.request.mockResolvedValue({
      status: 'committed',
      operation,
      resourceId: memberId,
      ledger,
      result: { tripId, memberId, revision, ledger },
    });
    await h.engine().recover(scope);
    expect(h.request.mock.calls[1][1]).toBe(`/mutation-requests/${key}`);
    expect(h.request.mock.calls[1][3]?.method).toBeUndefined();
    expect((await h.store.list(scope))[0]).toMatchObject({ status: 'completed', payload: null });
    expect(await h.store.list({ ...scope, accountId: memberId })).toEqual([]);
    expect(await h.store.list({ ...scope, environment: 'https://other/api/v1' })).toEqual([]);
  }
);
it.each(['member.create', 'member.rename'] as const)(
  '%s persists admin rejection with original input for explicit reconfirmation',
  async (operation) => {
    const h = await fixture();
    const input = operation === 'member.create' ? payload : { ...payload, operation, memberId };
    h.request
      .mockRejectedValueOnce(new ApiError('FORBIDDEN', 403))
      .mockResolvedValue({ status: 'rejected', operation, tripId, code: 'FORBIDDEN' });
    expect(await h.engine().confirm(scope, input)).toMatchObject({
      kind: 'completed',
      result: { code: 'FORBIDDEN' },
    });
    await h.restart();
    expect((await h.store.list(scope))[0].payload).toMatchObject(input);
    h.request.mockClear();
    await h.engine().retry(scope, key);
    expect(h.request).not.toHaveBeenCalled();
  }
);
it('lookup before a manual retry preserves the exact target, normalized name and UUID', async () => {
  const h = await fixture();
  const input = {
    ...payload,
    operation: 'member.rename' as const,
    memberId,
    body: { ...payload.body, display_name: ' Renamed ' },
  };
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  await h.engine().confirm(scope, input);
  await h.restart();
  h.request
    .mockResolvedValueOnce({ status: 'not_found' })
    .mockResolvedValueOnce({ tripId, memberId, revision, ledger });
  expect((await h.engine().retry(scope, key)).kind).toBe('completed');
  expect(h.request.mock.calls[2][1]).toBe(`/trips/${tripId}/members/${memberId}`);
  expect(h.request.mock.calls[2][3]?.body).toEqual({
    expected_revision: revision,
    display_name: 'Renamed',
    client_request_id: key,
  });
});
it('429 remains a shared account wait after restart and another trip cannot send early', async () => {
  const h = await fixture();
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  await h.engine().confirm(scope, payload);
  await h.restart();
  h.now = 131000;
  expect((await h.engine().confirm(scope, { ...payload, tripId: memberId })).kind).toBe('not-sent');
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(await h.store.retryAt(scope)).toBe(220000);
});
it('storage failure sends nothing and a session change during insert leaves the original operation recoverable', async () => {
  const h = await fixture();
  vi.spyOn(h.store, 'insert').mockRejectedValueOnce(new Error('full'));
  expect((await h.engine().confirm(scope, payload)).kind).toBe('not-sent');
  expect(h.request).not.toHaveBeenCalled();
  const insert = h.store.insert.bind(h.store);
  vi.spyOn(h.store, 'insert').mockImplementationOnce(async (record) => {
    const result = await insert(record);
    h.version = 1;
    return result;
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  expect(h.request).not.toHaveBeenCalled();
  expect((await h.store.list(scope))[0].status).toBe('pending');
});

it('same-trip C and G confirmation are coordinated atomically; another trip may continue', async () => {
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
      base_currency: 'TWD',
    },
    apiVersion: 2 as const,
    status: 'sending' as const,
    createdAt: 0,
    updatedAt: 0,
    conflict: false,
  };
  await pending.insert(record);
  expect((await h.engine().confirm(scope, payload)).kind).toBe('blocked');
  expect(h.request).not.toHaveBeenCalled();
  h.request.mockResolvedValue({ tripId: 'd'.repeat(24), memberId, revision, ledger });
  expect((await h.engine().confirm(scope, { ...payload, tripId: 'd'.repeat(24) })).kind).toBe(
    'completed'
  );
});

it.each(['leave', 'delete'] as const)(
  '%s survives restart and hidden membership; receipt only, no unauthorized resend',
  async (action) => {
    const h = await fixture();
    let hidden = false;
    const make = () =>
      new TripEntry({
        store: async () => h.store,
        request: h.request,
        newId: () => key,
        active: () => true,
        guard: () => (id) => {
          if (id && hidden) throw new ApiError('CANCELLED');
        },
      });
    h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
    expect(
      (
        await make().confirm(scope, {
          operation: 'trip.access',
          tripId,
          body: { action, expected_revision: revision },
        })
      ).kind
    ).toBe('pending');
    await h.restart();
    hidden = true;
    h.request.mockResolvedValueOnce({ status: 'not_found' });
    expect((await make().retry(scope, key)).kind).toBe('pending');
    expect(h.request).toHaveBeenCalledTimes(2);
    expect(h.request.mock.calls[1][1]).toBe(`/mutation-requests/${key}`);
    h.request.mockResolvedValueOnce({
      status: 'committed',
      operation: 'trip.access',
      resourceId: tripId,
      ledger,
      result: { tripId, action, exited: true, ledger },
    });
    expect((await make().lookup(scope, key)).kind).toBe('completed');
    await h.restart();
    expect((await h.store.list(scope))[0]).toMatchObject({ status: 'completed', payload: null });
    expect(h.request.mock.calls.slice(1).every((call) => call[3]?.method === undefined)).toBe(true);
  }
);
it('exit receipt recovery still blocks a changed sign-in and respects persisted 429', async () => {
  const h = await fixture();
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  await h.engine().confirm(scope, {
    operation: 'trip.access',
    tripId,
    body: { action: 'delete', expected_revision: revision },
  });
  await h.restart();
  h.now = 131000;
  expect((await h.engine().lookup(scope, key)).kind).toBe('pending');
  expect(h.request).toHaveBeenCalledTimes(1);
  h.now = 221000;
  h.request.mockImplementationOnce(async (_actor, _path, _schema, options) => {
    h.version = 1;
    options.beforeSend();
    return { status: 'not_found' };
  });
  expect((await h.engine().lookup(scope, key)).kind).toBe('pending');
  expect((await h.store.list(scope))[0].status).toBe('pending');
});
it('exit receipt and durable catalog denial commit atomically and survive restart', async () => {
  const h = await fixture();
  const { createDraftTripStore } = await import('@/storage/draftTrips');
  const drafts = await createDraftTripStore(h.db);
  await drafts.rememberName(scope, tripId, 'Private trip', 1);
  await drafts.rememberOptions(scope, tripId, { members: [], categories: [] }, 1);
  h.request.mockResolvedValue({ tripId, action: 'delete', exited: true, ledger });
  expect(
    (
      await h.engine().confirm(scope, {
        operation: 'trip.access',
        tripId,
        body: { action: 'delete', expected_revision: revision },
      })
    ).kind
  ).toBe('completed');
  await h.restart();
  expect(await (await createDraftTripStore(h.db)).get(scope, tripId)).toBeNull();
  expect((await h.store.list(scope))[0].status).toBe('completed');
});
it('failed exit receipt persistence hides immediately and leaves a recoverable original intent', async () => {
  const h = await fixture();
  const hide = vi.fn();
  const engine = new TripEntry({
    store: async () => h.store,
    request: h.request,
    newId: () => key,
    active: () => true,
    exited: hide,
  });
  vi.spyOn(h.store, 'complete').mockRejectedValueOnce(new Error('disk full'));
  h.request.mockResolvedValue({ tripId, action: 'leave', exited: true, ledger });
  expect(
    (
      await engine.confirm(scope, {
        operation: 'trip.access',
        tripId,
        body: { action: 'leave', expected_revision: revision },
      })
    ).kind
  ).toBe('pending');
  expect(hide).toHaveBeenCalledWith(expect.objectContaining(scope), tripId);
  await h.restart();
  expect((await h.store.list(scope))[0].status).toBe('pending');
  h.request.mockResolvedValue({
    status: 'committed',
    operation: 'trip.access',
    resourceId: tripId,
    ledger,
    result: { tripId, action: 'leave', exited: true, ledger },
  });
  expect((await h.engine().lookup(scope, key)).kind).toBe('completed');
});
it('final exit tombstone waits for older catalog saves even when its separate denial fails', async () => {
  const h = await fixture();
  let release!: () => void;
  const catalogDrain = new Promise<void>((_resolve, reject) => {
    release = () => reject(new Error('denial disk full'));
  });
  const complete = vi.spyOn(h.store, 'complete');
  const engine = new TripEntry({
    store: async () => h.store,
    request: h.request,
    newId: () => key,
    active: () => true,
    exited: () => catalogDrain,
  });
  h.request.mockResolvedValue({ tripId, action: 'delete', exited: true, ledger });
  const pending = engine.confirm(scope, {
    operation: 'trip.access',
    tripId,
    body: { action: 'delete', expected_revision: revision },
  });
  for (let i = 0; i < 80; i++) await Promise.resolve();
  expect(complete).not.toHaveBeenCalled();
  release();
  expect((await pending).kind).toBe('completed');
  await h.restart();
  const { createDraftTripStore } = await import('@/storage/draftTrips');
  expect(await (await createDraftTripStore(h.db)).get(scope, tripId)).toBeNull();
});
