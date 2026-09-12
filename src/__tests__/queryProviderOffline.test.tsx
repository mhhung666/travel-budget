import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { onlineManager, useIsRestoring, useQueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { useExpenseMutations } from '@/hooks/queries/useExpenseMutations';
import { tripKeys } from '@/hooks/queries/keys';
import { getQueryPersistKey } from '@/lib/queryPersister';
import { buildOptimisticExpense } from '@/lib/optimisticExpense';

const { storage, createExpense } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  createExpense: vi.fn(),
}));
// Keep the real async persister, JSON serialization and provider lifecycle.
// Only replace the browser's IndexedDB boundary with isolated storage.
vi.mock('idb-keyval', () => ({
  get: async (key: string) => storage.get(key),
  set: async (key: string, value: string) => {
    storage.set(key, value);
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
const persistKey = getQueryPersistKey('user:offline-test');
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryProvider cacheScope="user:offline-test" authenticated>
    {children}
  </QueryProvider>
);
function useProbe() {
  return { client: useQueryClient(), restoring: useIsRestoring(), ...useExpenseMutations('trip') };
}
function persisted() {
  return JSON.parse(storage.get(persistKey) ?? '{}').clientState;
}
afterEach(() => {
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
  storage.clear();
  createExpense.mockReset();
});

describe('QueryProvider offline startup', () => {
  it('preserves a queued expense across repeated offline starts, then sends once on reconnect', async () => {
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
    expect(createExpense).toHaveBeenCalledExactlyOnceWith(vars.tripId, vars.input);
    await waitFor(() => expect(persisted()?.mutations).toEqual([]), { timeout: 3000 });
    mounted.unmount();
  });
});
