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
      result: { tripId, memberId, revision },
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
    .mockResolvedValueOnce({ tripId, memberId, revision });
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
    },
    status: 'sending' as const,
    createdAt: 0,
    updatedAt: 0,
    conflict: false,
  };
  await pending.insert(record);
  expect((await h.engine().confirm(scope, payload)).kind).toBe('blocked');
  expect(h.request).not.toHaveBeenCalled();
  h.request.mockResolvedValue({ tripId: 'd'.repeat(24), memberId, revision });
  expect((await h.engine().confirm(scope, { ...payload, tripId: 'd'.repeat(24) })).kind).toBe(
    'completed'
  );
});
