import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activityDeletionStateSchema, type ActivityDeletionState } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { LocalRateLimitError } from '@/features/expenses/entry';
import { TripEntry } from '@/features/tripEntry/engine';
import { createMutationStore } from '@/storage/mutations';
import { memoryDatabase } from '@/test/sqlite';
import { readActivityDeletionPreview } from './batchDeletion';
const scope = { environment: 'https://test/api/v1', accountId: 'a'.repeat(24) };
const tripId = 'b'.repeat(24),
  dayId = 'c'.repeat(24);
const key = '12345678-1234-4234-8234-123456789abc';
const activityId = 'd'.repeat(24);
const body = {
  dayId,
  targets: [{ activityId, expectedRevision: 3 }],
  expectedContextRevision: 'e'.repeat(64),
};
const command = { operation: 'activities.delete' as const, tripId, body };
const terminal: ActivityDeletionState = {
  status: 'committed',
  client_request_id: key,
  tripId,
  operation: 'activities.delete',
  result: { dayId, activityIds: [activityId], count: 1 },
};
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'tb-bd2-'));
  const file = join(dir, 'pending.db');
  let db = memoryDatabase(file),
    store = await createMutationStore(db);
  let now = 1000,
    active = true,
    generation = 1;
  let receipt: ActivityDeletionState = { status: 'not_found' };
  const request = vi.fn(
    async (
      _account: string,
      _path: string,
      _schema: unknown,
      options?: { method?: string; beforeSend?: () => void; body?: unknown }
    ) => {
      options?.beforeSend?.();
      if (options?.method === 'POST') receipt = terminal;
      return receipt;
    }
  );
  const engine = () =>
    new TripEntry({
      store: async () => store,
      request: request as never,
      newId: () => key,
      now: () => now,
      active: () => active,
      guard: () => {
        const version = generation;
        return () => {
          if (version !== generation) throw new ApiError('CANCELLED');
        };
      },
    });
  cleanups.push(() => {
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
    set active(v: boolean) {
      active = v;
    },
    set generation(v: number) {
      generation = v;
    },
    set receipt(v: ActivityDeletionState) {
      receipt = v;
    },
    async restart() {
      db.close();
      db = memoryDatabase(file);
      store = await createMutationStore(db);
    },
  };
}
it('saves the strict batch before POST, validates and completes without ledger, then removes the frozen body', async () => {
  const h = await setup();
  h.request.mockImplementationOnce(async (_account, path, schema, options) => {
    expect(path).toBe(`/trips/${tripId}/itinerary/activity-deletions`);
    expect(schema).toBe(activityDeletionStateSchema);
    expect((await h.store.get(scope, key))?.payload?.body).toEqual({
      ...body,
      client_request_id: key,
    });
    expect(options?.body).toEqual({ ...body, client_request_id: key });
    options?.beforeSend?.();
    return terminal;
  });
  expect((await h.engine().confirm(scope, command)).kind).toBe('completed');
  await h.restart();
  expect((await h.store.get(scope, key))?.payload).toBeNull();
  expect((await h.store.get(scope, key))?.result).toMatchObject({
    status: 'committed',
    operation: 'activities.delete',
  });
});
it('after a lost response reopening SQLite only queries the original batch endpoint and UUID', async () => {
  const h = await setup();
  h.request.mockImplementationOnce(async () => {
    h.receipt = terminal;
    throw new ApiError('TIMEOUT');
  });
  expect((await h.engine().confirm(scope, command)).kind).toBe('pending');
  await h.restart();
  h.request.mockClear();
  await h.engine().recover(scope);
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(h.request.mock.calls[0][1]).toBe(`/trips/${tripId}/itinerary/activity-deletions/${key}`);
  expect(h.request.mock.calls[0][3]?.method).toBeUndefined();
  expect((await h.store.get(scope, key))?.status).toBe('completed');
});
it('startup not_found never sends; explicit retry looks up then uses the exact saved body and UUID', async () => {
  const h = await setup();
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  await h.engine().confirm(scope, command);
  await h.restart();
  h.request.mockClear();
  await h.engine().recover(scope);
  expect(h.request.mock.calls.map((c) => c[3]?.method ?? 'GET')).toEqual(['GET']);
  h.request.mockClear();
  expect((await h.engine().retry(scope, key)).kind).toBe('completed');
  expect(h.request.mock.calls.map((c) => c[3]?.method ?? 'GET')).toEqual(['GET', 'POST']);
  expect(h.request.mock.calls[1][3]?.body).toEqual({ ...body, client_request_id: key });
});
it('storage failure prevents submission and failed completion preserves the pending UUID', async () => {
  const h = await setup();
  vi.spyOn(h.store, 'insert').mockRejectedValueOnce(new Error('disk full'));
  expect((await h.engine().confirm(scope, command)).kind).toBe('not-sent');
  expect(h.request).not.toHaveBeenCalled();
  vi.spyOn(h.store, 'complete').mockRejectedValueOnce(new Error('disk full'));
  expect((await h.engine().confirm(scope, command)).kind).toBe('pending');
  await h.restart();
  await h.engine().recover(scope);
  expect(h.request.mock.calls.filter((c) => c[3]?.method === 'POST')).toHaveLength(1);
});
it.each(['CONFLICT', 'NOT_FOUND', 'FORBIDDEN', 'VALIDATION_ERROR'] as const)(
  'terminal %s retains exact selection across restart and releases the trip',
  async (code) => {
    const h = await setup();
    h.request.mockResolvedValueOnce({
      status: 'rejected',
      client_request_id: key,
      tripId,
      operation: 'activities.delete',
      code,
    });
    expect((await h.engine().confirm(scope, command)).kind).toBe('completed');
    await h.restart();
    expect((await h.store.get(scope, key))?.payload?.body).toEqual({
      ...body,
      client_request_id: key,
    });
    expect((await h.store.get(scope, key))?.result).toMatchObject({ status: 'rejected', code });
    await h.engine().dismiss(scope, key);
    expect(await h.store.get(scope, key)).toBeNull();
  }
);
it('double confirmation and existing single-item operations cannot bypass the trip reservation', async () => {
  const h = await setup();
  h.request.mockRejectedValue(new ApiError('TIMEOUT'));
  const engine = h.engine();
  const outcomes = await Promise.all([
    engine.confirm(scope, command),
    engine.confirm(scope, command),
  ]);
  expect(outcomes.map((o) => o.kind).sort()).toEqual(['blocked', 'pending']);
  expect(
    (
      await engine.confirm(scope, {
        operation: 'itinerary.write',
        tripId,
        body: {
          operation: 'activity.delete',
          dayId,
          activityId,
          expected_activity_revision: 3,
        },
      })
    ).kind
  ).toBe('blocked');
});
it.each(['uuid', 'trip', 'day', 'set', 'count', 'duplicate'])(
  'mismatched %s cannot settle or release a batch',
  async (field) => {
    const h = await setup();
    const result = { dayId, activityIds: [activityId], count: 1 };
    const raw = {
      ...terminal,
      ...(field === 'uuid'
        ? { client_request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
        : field === 'trip'
          ? { tripId: 'f'.repeat(24) }
          : {}),
      result: {
        ...result,
        ...(field === 'day'
          ? { dayId: 'f'.repeat(24) }
          : field === 'set'
            ? { activityIds: ['f'.repeat(24)] }
            : field === 'count'
              ? { count: 2 }
              : field === 'duplicate'
                ? { activityIds: [activityId, activityId], count: 2 }
                : {}),
      },
    };
    h.request.mockResolvedValueOnce(raw as ActivityDeletionState);
    expect((await h.engine().confirm(scope, command)).kind).toBe('pending');
    expect((await h.store.get(scope, key))?.status).toBe('pending');
  }
);
it('409 conflict survives lookup denial and 429 wait across restart; no resend occurs at 31 seconds', async () => {
  const h = await setup();
  h.request.mockRejectedValueOnce(new ApiError('IDEMPOTENCY_CONFLICT', 409));
  await h.engine().confirm(scope, command);
  await h.restart();
  h.request.mockRejectedValueOnce(new ApiError('FORBIDDEN', 403));
  await h.engine().lookup(scope, key);
  expect((await h.store.get(scope, key))?.conflict).toBe(true);
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  await h.engine().lookup(scope, key);
  await h.restart();
  h.now = 32000;
  h.request.mockClear();
  const retry = await h.engine().retry(scope, key);
  expect(retry.kind === 'pending' && retry.error).toBeInstanceOf(LocalRateLimitError);
  expect((await h.engine().confirm(scope, { ...command, tripId: 'f'.repeat(24) })).kind).toBe(
    'not-sent'
  );
  expect(h.request).not.toHaveBeenCalled();
  h.now = 122000;
  h.request.mockResolvedValue({ status: 'not_found' });
  await h.engine().retry(scope, key);
  expect(h.request.mock.calls.every((c) => c[3]?.method !== 'POST')).toBe(true);
});
it('account/environment isolation and late sign-in changes retain pending without settling another owner', async () => {
  const h = await setup();
  h.request.mockImplementationOnce(async () => {
    h.generation = 2;
    return terminal;
  });
  expect((await h.engine().confirm(scope, command)).kind).toBe('pending');
  expect((await h.store.get(scope, key))?.status).toBe('pending');
  expect(await h.store.list({ ...scope, accountId: 'f'.repeat(24) })).toEqual([]);
  expect(await h.store.list({ ...scope, environment: 'https://other' })).toEqual([]);
});
it('rejects invalid or oversize selections before saving or requesting', async () => {
  const h = await setup();
  for (const targets of [
    [],
    [...body.targets, ...body.targets],
    Array.from({ length: 16 }, (_, i) => ({
      activityId: i.toString(16).padStart(24, '0'),
      expectedRevision: 0,
    })),
  ]) {
    expect((await h.engine().confirm(scope, { ...command, body: { ...body, targets } })).kind).toBe(
      'not-sent'
    );
  }
  expect(await h.store.list(scope)).toEqual([]);
  expect(h.request).not.toHaveBeenCalled();
});
it('preview honors and repairs the account 429 deadline, and NOT_FOUND does not persist a trip denial', async () => {
  const h = await setup();
  const guard = vi.fn();
  const request = vi.fn().mockRejectedValue(new ApiError('NOT_FOUND', 404));
  const preview = () =>
    readActivityDeletionPreview({
      request,
      store: async () => h.store,
      scope,
      tripId,
      input: { dayId, targets: body.targets },
      guard,
      now: () => 1000,
    });
  await expect(preview()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const original = h.db.runAsync.bind(h.db);
  let fail = true;
  vi.spyOn(h.db, 'runAsync').mockImplementation((sql, ...args) =>
    fail && sql.includes('INSERT INTO expense_rate_limit')
      ? Promise.reject(new Error('disk full'))
      : original(sql, ...args)
  );
  request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  await expect(preview()).rejects.toThrow('disk full');
  request.mockClear();
  await expect(preview()).rejects.toThrow('disk full');
  expect(request).not.toHaveBeenCalled();
  fail = false;
  await expect(preview()).rejects.toBeInstanceOf(LocalRateLimitError);
  await h.restart();
  expect(await h.store.retryAt(scope)).toBe(121000);
});

it.each([undefined, true])(
  'CD2 restart/retry preserves the exact batch opt-in %s and original UUID',
  async (includeEndDayOffset) => {
    const h = await setup();
    const confirmed = {
      ...command,
      body: { ...body, ...(includeEndDayOffset ? { includeEndDayOffset: true as const } : {}) },
    };
    h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
    expect((await h.engine().confirm(scope, confirmed)).kind).toBe('pending');
    const before = (await h.store.get(scope, key))?.payload;
    await h.restart();
    h.request.mockClear();
    expect((await h.store.get(scope, key))?.payload).toEqual(before);
    await h.engine().recover(scope);
    expect(h.request.mock.calls.map((c) => c[3]?.method ?? 'GET')).toEqual(['GET']);
    h.request.mockClear();
    expect((await h.engine().retry(scope, key)).kind).toBe('completed');
    expect(h.request.mock.calls.map((c) => c[3]?.method ?? 'GET')).toEqual(['GET', 'POST']);
    const retry = h.request.mock.calls[1][3]?.body;
    expect(retry).toEqual({ ...confirmed.body, client_request_id: key });
    expect(Object.hasOwn(retry as object, 'includeEndDayOffset')).toBe(
      includeEndDayOffset === true
    );
  }
);
