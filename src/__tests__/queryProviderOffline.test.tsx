import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  dehydrate,
  onlineManager,
  useIsRestoring,
  useQueryClient,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryProvider, useQueryPersistenceControls } from '@/components/providers/QueryProvider';
import { useExpenseMutations } from '@/hooks/queries/useExpenseMutations';
import { tripKeys } from '@/hooks/queries/keys';
import {
  createExpenseOutbox,
  getExpenseOutboxKey,
  expenseOutboxQueryKey,
  type ExpenseOutbox,
} from '@/lib/expenseOutbox';
import { getQueryPersistKey } from '@/lib/queryPersister';
import type { TripShell } from '@/types';
import { buildOptimisticExpense } from '@/lib/optimisticExpense';

const { storage, createExpense, writeGate } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  createExpense: vi.fn(),
  writeGate: vi.fn(async () => {}),
}));
// Keep the real async persister, JSON serialization and provider lifecycle.
// Only replace the browser's IndexedDB boundary with isolated storage.
vi.mock('idb-keyval', () => ({
  get: async (key: string) => storage.get(key),
  set: async (key: string, value: string) => {
    storage.set(key, value);
  },
  update: async (key: string, updater: (value: unknown) => unknown) => {
    await writeGate();
    storage.set(key, structuredClone(updater(storage.get(key))) as string);
  },
  del: async (key: string) => {
    storage.delete(key);
  },
}));
vi.mock('@/actions', () => ({ createExpense, updateExpense: vi.fn(), deleteExpense: vi.fn() }));
vi.mock('@/lib/productEvents', () => ({ trackProductEvent: vi.fn() }));

const vars = {
  tripId: 'trip',
  input: {
    payer_id: 'user',
    description: 'Offline dinner',
    original_amount: 100,
    currency: 'TWD',
    exchange_rate: 1,
    category: 'food',
    date: '2026-09-12',
    splits: [{ user_id: 'user', share_amount: 100 }],
  },
};
const expenseKey = tripKeys.expenses(vars.tripId);
const shellKey = tripKeys.shell(vars.tripId);
let scope = '';
let persistKey = '';
beforeEach(() => {
  scope = `user:offline-test:${crypto.randomUUID()}`;
  persistKey = getQueryPersistKey(scope);
});
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryProvider cacheScope={scope} authenticated>
    {children}
  </QueryProvider>
);
function useProbe() {
  return {
    client: useQueryClient(),
    restoring: useIsRestoring(),
    ...useQueryPersistenceControls(),
    ...useExpenseMutations('trip'),
  };
}
function persisted() {
  return JSON.parse(storage.get(persistKey) ?? '{}').clientState;
}
afterEach(() => {
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
  storage.clear();
  createExpense.mockReset();
  writeGate.mockReset();
});

describe('QueryProvider offline startup', () => {
  it('does not acknowledge or send until IndexedDB commits, and survives immediate reload without a cache snapshot', async () => {
    const browserOnline = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    let release!: () => void;
    writeGate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    let mounted = renderHook(useProbe, { wrapper });
    await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
    let acknowledged = false;
    let queued!: Promise<void>;
    act(() => {
      queued = mounted.result.current.create.enqueue(vars).then(() => {
        acknowledged = true;
      });
    });
    await waitFor(() => expect(writeGate).toHaveBeenCalledOnce());
    expect(acknowledged).toBe(false);
    expect(createExpense).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await queued;
    });
    expect(acknowledged).toBe(true);
    mounted.unmount();
    storage.delete(persistKey);
    mounted = renderHook(useProbe, { wrapper });
    await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
    expect(mounted.result.current.client.getQueryData<unknown[]>(expenseKey)).toHaveLength(1);
    expect(createExpense).not.toHaveBeenCalled();
    createExpense.mockResolvedValue({
      success: true,
      data: buildOptimisticExpense(vars.input, {
        tripId: 'trip',
        id: 'saved',
        members: [],
        createdAt: new Date().toISOString(),
      }),
    });
    browserOnline.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(createExpense).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(mounted.result.current.client.getMutationCache().getAll()[0].state.status).toBe(
        'success'
      )
    );
    mounted.unmount();
  });
  it('rejects a submission when local storage fails, without sending or inserting a placeholder', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    const mounted = renderHook(useProbe, { wrapper });
    await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
    writeGate.mockRejectedValueOnce(new DOMException('Storage is full', 'QuotaExceededError'));
    await act(async () => {
      await expect(mounted.result.current.create.enqueue(vars)).rejects.toThrow('Storage is full');
    });
    expect(createExpense).not.toHaveBeenCalled();
    expect(mounted.result.current.client.getQueryData(expenseKey)).toBeUndefined();
    expect(storage.get(getExpenseOutboxKey(scope))).toBeUndefined();
    mounted.unmount();
  });
  it.each(['expired', 'incompatible', 'corrupt'])(
    'keeps the outbox when the query cache is %s',
    async (kind) => {
      vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
      let mounted = renderHook(useProbe, { wrapper });
      await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
      await act(async () => {
        await mounted.result.current.create.enqueue(vars);
      });
      mounted.unmount();
      storage.set(
        persistKey,
        kind === 'corrupt'
          ? 'invalid json'
          : JSON.stringify({
              timestamp: kind === 'expired' ? 1 : Date.now(),
              buster: kind === 'incompatible' ? 'old' : 'v9',
              clientState: { mutations: [], queries: [] },
            })
      );
      mounted = renderHook(useProbe, { wrapper });
      await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
      expect(mounted.result.current.client.getMutationCache().getAll()).toHaveLength(1);
      expect(mounted.result.current.client.getQueryData<unknown[]>(expenseKey)).toHaveLength(1);
      expect(createExpense).not.toHaveBeenCalled();
      mounted.unmount();
    }
  );
  it('retains a rejected draft after reload and replaces it atomically when corrected', async () => {
    const browserOnline = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    createExpense.mockResolvedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Membership removed',
    });
    let mounted = renderHook(useProbe, { wrapper });
    await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
    await act(async () => {
      await mounted.result.current.create.enqueue(vars);
    });
    await waitFor(() => expect(mounted.result.current.create.isError).toBe(true));
    const entries =
      mounted.result.current.client.getQueryData<ExpenseOutbox>(expenseOutboxQueryKey)!;
    const original = Object.values(entries)[0];
    expect(original).toMatchObject({
      status: 'failed',
      error: 'Membership removed',
      vars: { input: vars.input },
    });
    expect(mounted.result.current.hasPausedMutations()).toBe(true);
    mounted.unmount();
    browserOnline.mockReturnValue(false);
    mounted = renderHook(useProbe, { wrapper });
    await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
    expect(mounted.result.current.client.getMutationCache().getAll()).toHaveLength(0);
    expect(mounted.result.current.client.getQueryData(expenseOutboxQueryKey)).toEqual(entries);
    writeGate.mockRejectedValueOnce(new Error('Disk full'));
    const correction = {
      ...vars,
      replacesRequestId: original.vars.input.client_request_id,
      input: { ...vars.input, description: 'Corrected dinner' },
    };
    await act(async () => {
      await expect(mounted.result.current.create.enqueue(correction)).rejects.toThrow('Disk full');
    });
    expect(mounted.result.current.client.getQueryData(expenseOutboxQueryKey)).toEqual(entries);
    await act(async () => {
      await mounted.result.current.create.enqueue(correction);
    });
    const corrected = Object.values(
      mounted.result.current.client.getQueryData<ExpenseOutbox>(expenseOutboxQueryKey)!
    );
    expect(corrected.filter((e) => e.status === 'failed')).toHaveLength(0);
    expect(corrected.filter((e) => e.status === 'pending')).toHaveLength(1);
    expect(corrected.find((e) => e.status === 'pending')?.vars.input.description).toBe(
      'Corrected dinner'
    );
    await act(async () => {
      await expect(mounted.result.current.create.enqueue(correction)).rejects.toThrow(
        'already been replaced'
      );
    });
    expect(createExpense).toHaveBeenCalledOnce();
    await act(async () => {
      await mounted.result.current.clearForLogout();
    });
    expect(storage.get(getExpenseOutboxKey(scope))).toBeUndefined();
    mounted.unmount();
  });
  it('combines projections from separate tabs and refreshes derived cached reads', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const base = { expense_count: 4, total_spent: 82, today_spent: 82 };
    const first = { expense_count: 5, total_spent: 113, today_spent: 113 };
    const second = { expense_count: 5, total_spent: 119, today_spent: 119 };
    const snapshot = new QueryClient();
    snapshot.setQueryData(shellKey, first);
    storage.set(
      persistKey,
      JSON.stringify({ timestamp: Date.now(), buster: 'v9', clientState: dehydrate(snapshot) })
    );
    for (const [amount, projection] of [
      [31, first],
      [37, second],
    ] as const) {
      const requestId = crypto.randomUUID();
      await createExpenseOutbox(scope).write({
        vars: {
          ...vars,
          input: { ...vars.input, client_request_id: requestId, original_amount: amount },
        },
        status: 'pending',
        createdAt: Date.now(),
        context: {
          optimisticId: `optimistic_${requestId}`,
          wasOffline: true,
          previousShell: base as TripShell,
          appliedShell: projection as TripShell,
        },
      });
    }
    const mounted = renderHook(useProbe, { wrapper });
    await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
    expect(mounted.result.current.client.getQueryData(shellKey)).toEqual({
      expense_count: 6,
      total_spent: 150,
      today_spent: 150,
    });
    expect(mounted.result.current.client.getQueryState(shellKey)?.isInvalidated).toBe(true);
    expect(mounted.result.current.client.getQueryData<unknown[]>(expenseKey)).toHaveLength(2);
    expect(createExpense).not.toHaveBeenCalled();
    mounted.unmount();
    snapshot.clear();
  });
  it.each([false, true])(
    'preserves a queue across repeated offline starts (legacy=%s)',
    async (legacy) => {
      const browserOnline = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
      onlineManager.setOnline(true);
      let mounted = renderHook(useProbe, { wrapper });
      await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
      browserOnline.mockReturnValue(false);
      act(() => window.dispatchEvent(new Event('offline')));
      const shell = { expense_count: 0, total_spent: 0, today_spent: 0 };
      act(() => {
        mounted.result.current.client.setQueryData(shellKey, shell);
        mounted.result.current.client.setQueryData(tripKeys.currentUser, { id: 'user' });
        mounted.result.current.create.mutate(vars);
      });
      await waitFor(() => expect(mounted.result.current.create.isPaused).toBe(true));
      await waitFor(() => expect(persisted()?.mutations[0]?.state.context).toBeDefined(), {
        timeout: 3000,
      });
      let expectedRequestId = persisted().mutations[0].state.variables.input.client_request_id;
      if (legacy) {
        const oldCache = JSON.parse(storage.get(persistKey)!);
        delete oldCache.clientState.mutations[0].state.variables.input.client_request_id;
        expectedRequestId = oldCache.clientState.mutations[0].state.context.optimisticId.replace(
          /^optimistic_/,
          ''
        );
        storage.set(persistKey, JSON.stringify(oldCache));
        storage.delete(getExpenseOutboxKey(scope));
      }
      const optimistic = mounted.result.current.client.getQueryData(expenseKey);
      const projectedShell = mounted.result.current.client.getQueryData(shellKey);
      expect(projectedShell).toMatchObject({ expense_count: 1, total_spent: 100 });

      for (let reload = 0; reload < 2; reload++) {
        mounted.unmount();
        // A fresh JS realm starts online even though the browser remains offline.
        onlineManager.setOnline(true);
        mounted = renderHook(useProbe, { wrapper });
        await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
        expect(mounted.result.current.client.getMutationCache().getAll()[0].state).toMatchObject({
          status: 'pending',
          isPaused: true,
        });
        expect(mounted.result.current.client.getQueryData(expenseKey)).toEqual(optimistic);
        expect(mounted.result.current.client.getQueryData(shellKey)).toEqual(projectedShell);
        // Force a persisted cache update and wait past the real throttle window.
        act(() => mounted.result.current.client.setQueryData(['reload'], reload));
        await waitFor(
          () =>
            expect(
              persisted()?.queries.some(
                (q: { queryKey: string[]; state: { data: number } }) =>
                  q.queryKey[0] === 'reload' && q.state.data === reload
              )
            ).toBe(true),
          { timeout: 3000 }
        );
        expect(persisted().mutations).toHaveLength(1);
        expect(createExpense).not.toHaveBeenCalled();
      }

      const saved = buildOptimisticExpense(vars.input, {
        tripId: vars.tripId,
        id: 'saved',
        members: [],
        createdAt: '2026-09-12T00:00:00Z',
      });
      createExpense.mockResolvedValue({ success: true, data: saved });
      browserOnline.mockReturnValue(true);
      act(() => window.dispatchEvent(new Event('online')));
      await waitFor(() =>
        expect(mounted.result.current.client.getQueryData(expenseKey)).toEqual([saved])
      );
      expect(createExpense).toHaveBeenCalledExactlyOnceWith(
        vars.tripId,
        expect.objectContaining({ ...vars.input, client_request_id: expectedRequestId })
      );
      await waitFor(() => expect(persisted()?.mutations).toEqual([]), { timeout: 3000 });
      mounted.unmount();
    }
  );
  it.each(['in-flight', 'retrying'])(
    'restores a %s request after reload and reuses its original key',
    async (phase) => {
      const browserOnline = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
      onlineManager.setOnline(true);
      let reject!: (reason: Error) => void;
      createExpense.mockReturnValueOnce(
        new Promise((_resolve, fail) => {
          reject = fail;
        })
      );
      let mounted = renderHook(useProbe, { wrapper });
      await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
      act(() => mounted.result.current.create.mutate(vars));
      await waitFor(() => expect(createExpense).toHaveBeenCalledOnce());
      const sent = structuredClone(createExpense.mock.calls[0][1]);
      expect(sent.client_request_id).toEqual(expect.any(String));
      if (phase === 'retrying') {
        browserOnline.mockReturnValue(false);
        act(() => window.dispatchEvent(new Event('offline')));
        await act(async () => reject(new TypeError('Failed to fetch')));
        await waitFor(() => expect(mounted.result.current.create.failureCount).toBe(1));
        await waitFor(() => expect(mounted.result.current.create.isPaused).toBe(true), {
          timeout: 3000,
        });
      }
      // In-flight remains online: persistence must not require isPaused.
      await waitFor(() => expect(persisted()?.mutations[0]?.state.variables.input).toEqual(sent), {
        timeout: 3000,
      });
      await waitFor(() => expect(persisted()?.mutations[0]?.state.context).toBeDefined(), {
        timeout: 3000,
      });
      const optimistic = mounted.result.current.client.getQueryData(expenseKey);
      mounted.unmount();
      browserOnline.mockReturnValue(false);
      onlineManager.setOnline(false);
      mounted = renderHook(useProbe, { wrapper });
      await waitFor(() => expect(mounted.result.current.restoring).toBe(false));
      expect(mounted.result.current.client.getMutationCache().getAll()[0].state).toMatchObject({
        status: 'pending',
        isPaused: true,
      });
      expect(mounted.result.current.client.getQueryData(expenseKey)).toEqual(optimistic);
      const saved = buildOptimisticExpense(vars.input, {
        tripId: vars.tripId,
        id: 'committed-before-reload',
        members: [],
        createdAt: '2026-09-12T00:00:00Z',
      });
      createExpense.mockResolvedValue({ success: true, data: saved });
      browserOnline.mockReturnValue(true);
      act(() => window.dispatchEvent(new Event('online')));
      await waitFor(() =>
        expect(mounted.result.current.client.getQueryData(expenseKey)).toEqual([saved])
      );
      expect(createExpense).toHaveBeenCalledTimes(2);
      expect(createExpense.mock.calls[1][1]).toEqual(sent);
      await waitFor(() => expect(persisted()?.mutations).toEqual([]), { timeout: 3000 });
      mounted.unmount();
    }
  );
});
