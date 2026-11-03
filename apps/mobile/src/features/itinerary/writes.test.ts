import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { itineraryWriteStateSchema, type ItineraryWriteState } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { LocalRateLimitError } from '@/features/expenses/entry';
import { TripEntry } from '@/features/tripEntry/engine';
import { createMutationStore } from '@/storage/mutations';
import { memoryDatabase } from '@/test/sqlite';
import { readItineraryEditContext } from './editContext';
const scope = { environment: 'https://test/api/v1', accountId: 'a'.repeat(24) };
const tripId = 'b'.repeat(24),
  dayId = 'c'.repeat(24);
const key = '12345678-1234-4234-8234-123456789abc';
const body = {
  operation: 'day.create' as const,
  title: '旅程',
  content: '# Private\n'.repeat(2000),
  location: null,
  target: { day_number: 1, expected_start_date: null, expected_end_date: null },
};
const command = { operation: 'itinerary.write' as const, tripId, body };
const terminal: ItineraryWriteState = {
  status: 'committed',
  client_request_id: key,
  tripId,
  operation: 'day.create',
  result: { dayId, dayRevision: 0, activityId: null, activityRevision: null, deleted: false },
};
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'tb-2b-'));
  const file = join(dir, 'pending.db');
  let db = memoryDatabase(file),
    store = await createMutationStore(db);
  let now = 1000,
    active = true,
    generation = 1;
  let receipt: ItineraryWriteState = { status: 'not_found' };
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
    set receipt(v: ItineraryWriteState) {
      receipt = v;
    },
    async restart() {
      db.close();
      db = memoryDatabase(file);
      store = await createMutationStore(db);
    },
  };
}
it('persists the full frozen command before POST, validates the native schema, completes without ledger and removes committed private text', async () => {
  const h = await setup();
  h.request.mockImplementationOnce(async (account, path, schema, options) => {
    expect(account).toBe(scope.accountId);
    expect(path).toBe(`/trips/${tripId}/itinerary/requests`);
    expect(schema).toBe(itineraryWriteStateSchema);
    expect((await h.store.get(scope, key))?.payload?.body).toEqual({
      ...body,
      client_request_id: key,
    });
    expect(options?.body).toEqual({ ...body, client_request_id: key });
    options?.beforeSend?.();
    return terminal;
  });
  expect((await h.engine().confirm(scope, command)).kind).toBe('completed');
  const saved = (await h.store.get(scope, key))!;
  expect(saved.status).toBe('completed');
  expect(saved.payload).toBeNull();
  expect(saved.result).toMatchObject({
    status: 'committed',
    operation: 'itinerary.write',
    result: { tripId, receipt: terminal },
  });
});
it('lost response survives reopening SQLite; startup only queries the original UUID and never POSTs', async () => {
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
  expect(h.request.mock.calls[0][1]).toBe(`/trips/${tripId}/itinerary/requests/${key}`);
  expect(h.request.mock.calls[0][3]?.method).toBeUndefined();
  expect((await h.store.get(scope, key))?.status).toBe('completed');
});
it('explicit retry queries first and replays the exact original content with one UUID after not_found', async () => {
  const h = await setup();
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  await h.engine().confirm(scope, command);
  await h.restart();
  h.request.mockClear();
  expect((await h.engine().retry(scope, key)).kind).toBe('completed');
  expect(h.request.mock.calls.map((c) => c[3]?.method ?? 'GET')).toEqual(['GET', 'POST']);
  expect(h.request.mock.calls[1][3]?.body).toEqual({ ...body, client_request_id: key });
});
it('does not POST when SQLite insertion fails', async () => {
  const h = await setup();
  vi.spyOn(h.store, 'insert').mockRejectedValueOnce(new Error('disk full'));
  expect((await h.engine().confirm(scope, command)).kind).toBe('not-sent');
  expect(h.request).not.toHaveBeenCalled();
});
it('keeps the pending command when local completion fails, then recovers without another POST', async () => {
  const h = await setup();
  vi.spyOn(h.store, 'complete').mockRejectedValueOnce(new Error('disk full'));
  expect((await h.engine().confirm(scope, command)).kind).toBe('pending');
  expect((await h.store.get(scope, key))?.status).toBe('pending');
  await h.restart();
  await h.engine().recover(scope);
  expect(h.request.mock.calls.filter((c) => c[3]?.method === 'POST')).toHaveLength(1);
});
it('merges double confirm and prevents another operation on the same trip while uncertain', async () => {
  const h = await setup();
  h.request.mockRejectedValue(new ApiError('TIMEOUT'));
  const engine = h.engine();
  const outcomes = await Promise.all([
    engine.confirm(scope, command),
    engine.confirm(scope, command),
  ]);
  expect(outcomes.map((o) => o.kind).sort()).toEqual(['blocked', 'pending']);
  expect(
    (await engine.confirm(scope, { ...command, body: { ...body, title: 'Another' } })).kind
  ).toBe('blocked');
  await engine.dismiss(scope, key);
  await engine.abandon(scope, key);
  expect((await h.store.get(scope, key))?.status).toBe('pending');
});
it.each([400, 401, 403, 404, 413, 415, 500])(
  'HTTP %i preserves uncertain submissions and their UUID',
  async (status) => {
    const h = await setup();
    h.request.mockRejectedValue(new ApiError('FAILURE', status));
    expect((await h.engine().confirm(scope, command)).kind).toBe('pending');
    expect((await h.store.get(scope, key))?.payload?.body.client_request_id).toBe(key);
  }
);
it('409 conflict survives later denied queries, forbids replay after restart, and permits receipt lookup', async () => {
  const h = await setup();
  h.request.mockRejectedValueOnce(new ApiError('IDEMPOTENCY_CONFLICT', 409));
  await h.engine().confirm(scope, command);
  await h.restart();
  h.request.mockRejectedValueOnce(new ApiError('FORBIDDEN', 403));
  await h.engine().lookup(scope, key);
  h.request.mockResolvedValue({ status: 'not_found' });
  h.request.mockClear();
  expect((await h.engine().retry(scope, key)).kind).toBe('pending');
  expect(h.request.mock.calls.every((c) => c[3]?.method !== 'POST')).toBe(true);
  expect((await h.store.get(scope, key))?.conflict).toBe(true);
});
it('429 persists the full account-wide wait through restart, including lookups and other trips', async () => {
  const h = await setup();
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  await h.engine().confirm(scope, command);
  await h.restart();
  h.now = 32000;
  h.request.mockClear();
  const retry = await h.engine().retry(scope, key);
  expect(retry.kind === 'pending' && retry.error).toBeInstanceOf(LocalRateLimitError);
  expect((await h.engine().confirm(scope, { ...command, tripId: 'd'.repeat(24) })).kind).toBe(
    'not-sent'
  );
  expect(h.request).not.toHaveBeenCalled();
  expect(await h.store.retryAt(scope)).toBe(121000);
});
it.each([
  'CONFLICT',
  'TRIP_DATES_CHANGED',
  'DELETE_IMPACT_CHANGED',
  'NOT_FOUND',
  'VALIDATION_ERROR',
] as const)(
  'terminal %s releases the trip but retains user input for explicit reconfirmation',
  async (code) => {
    const h = await setup();
    h.request.mockResolvedValueOnce({
      status: 'rejected',
      client_request_id: key,
      tripId,
      operation: 'day.create',
      code,
    });
    expect((await h.engine().confirm(scope, command)).kind).toBe('completed');
    await h.restart();
    const saved = (await h.store.get(scope, key))!;
    expect(saved.status).toBe('completed');
    expect(saved.payload).toMatchObject(command);
    expect(saved.result).toMatchObject({ status: 'rejected', code });
    await h.engine().dismiss(scope, key);
    expect(await h.store.get(scope, key)).toBeNull();
  }
);
it.each(['uuid', 'trip', 'operation'])(
  'rejects mismatching native receipt %s without clearing the pending request',
  async (field) => {
    const h = await setup();
    h.request.mockResolvedValueOnce({
      ...terminal,
      ...(field === 'uuid'
        ? { client_request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
        : field === 'trip'
          ? { tripId: 'd'.repeat(24) }
          : { operation: 'day.delete' }),
    } as ItineraryWriteState);
    expect((await h.engine().confirm(scope, command)).kind).toBe('pending');
    expect((await h.store.get(scope, key))?.status).toBe('pending');
  }
);
it('isolates accounts/environments, and rejects a stale sign-in guard immediately before transport', async () => {
  const h = await setup();
  h.request.mockImplementationOnce(async (_a, _p, _s, options) => {
    h.generation = 2;
    options?.beforeSend?.();
    return terminal;
  });
  expect((await h.engine().confirm(scope, command)).kind).toBe('pending');
  expect(await h.store.list({ ...scope, accountId: 'd'.repeat(24) })).toEqual([]);
  expect(await h.store.list({ ...scope, environment: 'https://other/api/v1' })).toEqual([]);
  h.active = false;
  h.request.mockClear();
  await h.engine().recover(scope);
  expect(h.request).not.toHaveBeenCalled();
});
it('does not let a late success from a previous sign-in settle the request', async () => {
  const h = await setup();
  h.request.mockImplementationOnce(async () => {
    h.generation = 2;
    return terminal;
  });
  expect((await h.engine().confirm(scope, command)).kind).toBe('pending');
  expect((await h.store.get(scope, key))?.status).toBe('pending');
});
it('edit-context reads respect saved account waits and persist new 429 deadlines; 403 does not hide a member trip', async () => {
  const h = await setup();
  const deny = vi.fn(),
    guard = vi.fn();
  const request = vi.fn().mockRejectedValue(new ApiError('FORBIDDEN', 403));
  const read = () =>
    readItineraryEditContext({
      request,
      store: async () => h.store,
      scope,
      tripId,
      guard,
      deny,
      now: () => 1000,
    });
  await expect(read()).rejects.toMatchObject({ status: 403 });
  expect(deny).not.toHaveBeenCalled();
  request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  await expect(read()).rejects.toMatchObject({ status: 429 });
  expect(await h.store.retryAt(scope)).toBe(121000);
  request.mockClear();
  await expect(read()).rejects.toBeInstanceOf(LocalRateLimitError);
  expect(request).not.toHaveBeenCalled();
});
it('edit-context reads deny removed memberships and discard late results after revocation', async () => {
  const h = await setup();
  const deny = vi.fn(),
    guard = vi.fn();
  const request = vi.fn().mockRejectedValueOnce(new ApiError('NOT_FOUND', 404));
  const read = () =>
    readItineraryEditContext({ request, store: async () => h.store, scope, tripId, guard, deny });
  await expect(read()).rejects.toMatchObject({ status: 404 });
  expect(deny).toHaveBeenCalledTimes(1);
  request.mockImplementationOnce(async () => {
    guard.mockImplementation(() => {
      throw new ApiError('CANCELLED');
    });
    return { tripId, startDate: null, endDate: null, days: [] };
  });
  await expect(read()).rejects.toMatchObject({ code: 'CANCELLED' });
});
it('a failed 429 save keeps the original deadline in memory and repairs it before another request', async () => {
  const h = await setup();
  const original = h.db.runAsync.bind(h.db);
  let fail = true;
  vi.spyOn(h.db, 'runAsync').mockImplementation((sql, ...args) => {
    if (fail && sql.includes('INSERT INTO expense_rate_limit'))
      return Promise.reject(new Error('disk full'));
    return original(sql, ...args);
  });
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  expect((await h.engine().confirm(scope, command)).kind).toBe('pending');
  h.now = 32000;
  h.request.mockClear();
  expect((await h.engine().retry(scope, key)).kind).toBe('pending');
  expect(h.request).not.toHaveBeenCalled();
  fail = false;
  expect(await h.store.retryAt(scope)).toBe(121000);
  await h.restart();
  expect(await h.store.retryAt(scope)).toBe(121000);
});

const activityId = 'e'.repeat(24);
const activity = {
  title: 'Late train',
  type: 'transport' as const,
  time: '23:40',
  endTime: '00:20',
  location: null,
  locationName: 'Station',
  note: 'Private notes',
  confirmationCode: '00120',
};
it.each(['activity.create', 'activity.update', 'activity.delete'] as const)(
  '%s saves before transport, survives a lost response and restart, and recovers the original receipt without a second write',
  async (operation) => {
    const h = await setup();
    const body =
      operation === 'activity.create'
        ? { operation, dayId, activity }
        : operation === 'activity.update'
          ? { operation, dayId, activityId, expected_activity_revision: 3, activity }
          : { operation, dayId, activityId, expected_activity_revision: 3 };
    const receipt: ItineraryWriteState = {
      ...terminal,
      operation,
      result: {
        dayId,
        dayRevision: 5,
        activityId,
        activityRevision: operation === 'activity.delete' ? null : 4,
        deleted: operation === 'activity.delete',
      },
    };
    let writes = 0;
    h.request.mockImplementationOnce(async (_a, _p, _s, options) => {
      expect((await h.store.get(scope, key))?.payload?.body).toEqual({
        ...body,
        client_request_id: key,
      });
      expect(options?.body).toEqual({ ...body, client_request_id: key });
      options?.beforeSend?.();
      writes++;
      h.receipt = receipt;
      throw new ApiError('TIMEOUT');
    });
    const result = await h.engine().confirm(scope, { operation: 'itinerary.write', tripId, body });
    expect(result.kind).toBe('pending');
    await h.restart();
    h.request.mockClear();
    await h.engine().recover(scope);
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(h.request.mock.calls[0][3]?.method).toBeUndefined();
    expect((await h.store.get(scope, key))?.result).toMatchObject({
      status: 'committed',
      result: { receipt },
    });
    expect(writes).toBe(1);
    expect((await h.store.get(scope, key))?.payload).toBeNull();
  }
);
it('retries only the exact saved activity body after not_found and never uses a new UUID', async () => {
  const h = await setup();
  const body = {
    operation: 'activity.update' as const,
    dayId,
    activityId,
    expected_activity_revision: 3,
    activity,
  };
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  await h.engine().confirm(scope, { operation: 'itinerary.write', tripId, body });
  await h.restart();
  h.request.mockResolvedValueOnce({ status: 'not_found' }).mockResolvedValueOnce({
    ...terminal,
    operation: 'activity.update',
    result: { dayId, dayRevision: 5, activityId, activityRevision: 4, deleted: false },
  });
  h.request.mockClear();
  expect((await h.engine().retry(scope, key)).kind).toBe('completed');
  expect(h.request.mock.calls.map((c) => c[3]?.method ?? 'GET')).toEqual(['GET', 'POST']);
  expect(h.request.mock.calls[1][3]?.body).toEqual({ ...body, client_request_id: key });
});
it.each(['dayId', 'activityId', 'deleted', 'missingActivityId'])(
  'an activity receipt with wrong %s cannot release the original pending command',
  async (field) => {
    const h = await setup();
    h.request.mockResolvedValueOnce({
      ...terminal,
      operation: 'activity.update',
      result: {
        dayId,
        dayRevision: 5,
        activityId,
        activityRevision: 4,
        deleted: false,
        ...(field === 'dayId'
          ? { dayId: 'f'.repeat(24) }
          : field === 'activityId'
            ? { activityId: 'f'.repeat(24) }
            : field === 'deleted'
              ? { deleted: true }
              : { activityId: null }),
      },
    });
    expect(
      (
        await h.engine().confirm(scope, {
          operation: 'itinerary.write',
          tripId,
          body: {
            operation: 'activity.update',
            dayId,
            activityId,
            expected_activity_revision: 3,
            activity,
          },
        })
      ).kind
    ).toBe('pending');
    expect((await h.store.get(scope, key))?.status).toBe('pending');
  }
);
it.each(['CONFLICT', 'NOT_FOUND', 'ACTIVITY_LIMIT'] as const)(
  'activity %s is terminal and retains the rejected input across restart',
  async (code) => {
    const h = await setup();
    const body = { operation: 'activity.create' as const, dayId, activity };
    h.request.mockResolvedValueOnce({
      status: 'rejected',
      client_request_id: key,
      tripId,
      operation: 'activity.create',
      code,
    });
    expect(
      (await h.engine().confirm(scope, { operation: 'itinerary.write', tripId, body })).kind
    ).toBe('completed');
    await h.restart();
    expect((await h.store.get(scope, key))?.payload?.body).toEqual({
      ...body,
      client_request_id: key,
    });
    expect((await h.store.get(scope, key))?.result).toMatchObject({ status: 'rejected', code });
  }
);
