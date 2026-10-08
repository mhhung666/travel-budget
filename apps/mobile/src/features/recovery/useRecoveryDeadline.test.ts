import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { memoryDatabase } from '@/test/sqlite';
import { createMutationStore, type MutationStore } from '@/storage/mutations';
import { createPendingExpenseStore } from '@/storage/pendingExpenses';
import { TripEntry } from '@/features/tripEntry/engine';
import { useRecoveryClock } from './useRecoveryClock';
import { recoveryDeadlineOptions, useRecoveryDeadline } from './useRecoveryDeadline';

const h = vi.hoisted(() => ({
  store: null as MutationStore | null,
  until: 0,
  failed: false,
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  j: 0,
  i: 0,
  effects: [] as (() => void | (() => void))[],
  refetch: vi.fn(),
}));
vi.mock('@/storage/pendingExpenseDatabase', () => ({
  openMutationStore: async () => {
    if (h.failed) throw new Error('disk unavailable');
    return h.store;
  },
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.i++;
    if (!(i in h.values)) h.values[i] = typeof initial === 'function' ? initial() : initial;
    return [
      h.values[i],
      (value: unknown) => {
        h.values[i] = value;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.j++] ??= { current: initial }),
  useEffect: (fn: () => void | (() => void)) => h.effects.push(fn),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: h.until, isError: h.failed, refetch: h.refetch }),
}));
const scope = { environment: 'https://example/api/v1', accountId: '1'.repeat(24) };
const id = '11111111-1111-4111-8111-111111111111';
const cleanups: (() => void)[] = [];
beforeEach(() => {
  h.values = [];
  h.refs = [];
  h.j = 0;
  h.i = 0;
  h.effects = [];
  h.failed = false;
  h.until = 0;
  vi.clearAllMocks();
});
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  vi.useRealTimers();
});
it('reads an E HTTP 429 original deadline after closing and reopening SQLite, never restarting the wait', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-u2e-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'pending.db');
  let db = memoryDatabase(path);
  let store = await createMutationStore(db);
  let now = 100000;
  const request = vi.fn().mockRejectedValue(new ApiError('BUSY', 429, 120));
  const entry = new TripEntry({
    store: async () => store,
    request,
    newId: () => id,
    now: () => now,
    active: () => true,
  });
  expect(
    await entry.confirm(scope, {
      operation: 'trip.create',
      body: {
        name: 'Trip',
        description: '',
        start_date: null,
        end_date: null,
        base_currency: 'TWD',
      },
    })
  ).toMatchObject({ kind: 'pending' });
  h.store = store;
  const options = recoveryDeadlineOptions(scope);
  expect(await options.queryFn()).toBe(220000);
  expect(options.networkMode).toBe('always');
  db.close();
  db = memoryDatabase(path);
  store = await createMutationStore(db);
  h.store = store;
  cleanups.push(() => db.close());
  now += 31000;
  expect(await recoveryDeadlineOptions(scope).queryFn()).toBe(220000);
  await store.pause(scope, now + 30000);
  expect(await options.queryFn()).toBe(220000);
  expect(await recoveryDeadlineOptions({ ...scope, accountId: '2'.repeat(24) }).queryFn()).toBe(0);
  expect(
    await recoveryDeadlineOptions({ ...scope, environment: 'https://other/api/v1' }).queryFn()
  ).toBe(0);
  expect(request).toHaveBeenCalledTimes(1);
});
it('reads the same deadline written by C even with no E records', async () => {
  const db = memoryDatabase();
  cleanups.push(() => db.close());
  const c = await createPendingExpenseStore(db);
  await c.pause!(scope, id, 'busy', 300000);
  h.store = await createMutationStore(db);
  expect(await h.store.list(scope)).toEqual([]);
  expect(await recoveryDeadlineOptions(scope).queryFn()).toBe(300000);
});
it('propagates storage failures instead of reporting a zero deadline', async () => {
  h.failed = true;
  await expect(recoveryDeadlineOptions(scope).queryFn()).rejects.toThrow('disk unavailable');
  expect(recoveryDeadlineOptions(null).enabled).toBe(false);
  expect(recoveryDeadlineOptions(scope).queryKey).not.toEqual(
    recoveryDeadlineOptions({ ...scope, accountId: 'b' }).queryKey
  );
});
it('expires the presentation clock without changing, saving or announcing the deadline', () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  h.until = 220000;
  const first = useRecoveryDeadline(scope, 1);
  expect(first.waiting).toBe(true);
  for (const effect of h.effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  expect(h.refetch).not.toHaveBeenCalled();
  vi.advanceTimersByTime(31000);
  h.i = h.j = 0;
  expect(useRecoveryDeadline(scope, 1).waiting).toBe(true);
  vi.advanceTimersByTime(89000);
  h.i = h.j = 0;
  const last = useRecoveryDeadline(scope, 1);
  expect(last.waiting).toBe(false);
  expect(last.until).toBe(220000);
});

it('updates a row-only waiting clock at expiry and restarts it only for a longer deadline', () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  let until = 130000;
  expect(useRecoveryClock(until)).toBe(100000);
  for (const effect of h.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  vi.advanceTimersByTime(30000);
  h.i = 0;
  expect(useRecoveryClock(until)).toBe(130000);
  expect(until).toBe(130000);
  expect(vi.getTimerCount()).toBe(0);
  h.effects = [];
  until = 250000;
  h.i = 0;
  expect(useRecoveryClock(until)).toBe(130000);
  for (const effect of h.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  vi.advanceTimersByTime(0);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(120000);
  h.i = 0;
  expect(useRecoveryClock(until)).toBe(250000);
  expect(vi.getTimerCount()).toBe(0);
});
