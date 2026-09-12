import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
  dehydrate,
  hydrate,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Expense, TripShell } from '@/types';
import { tripKeys } from '@/hooks/queries/keys';
import { registerOfflineMutationDefaults } from '@/lib/offlineMutations';
import { buildOptimisticExpense } from '@/lib/optimisticExpense';

const createExpense = vi.hoisted(() => vi.fn());
vi.mock('@/actions', () => ({ createExpense, updateExpense: vi.fn(), deleteExpense: vi.fn() }));
vi.mock('@/lib/productEvents', () => ({ trackProductEvent: vi.fn() }));
import { useExpenseMutations } from '@/hooks/queries/useExpenseMutations';
const vars = {
  tripId: 'trip',
  input: {
    payer_id: 'user',
    description: 'Dinner',
    original_amount: 100,
    currency: 'TWD',
    exchange_rate: 1,
    category: 'food',
    date: '2026-09-07',
    splits: [{ user_id: 'user', share_amount: 100 }],
  },
};
const saved = buildOptimisticExpense(vars.input, {
  tripId: 'trip',
  id: 'saved',
  members: [],
  createdAt: '2026-09-07T00:00:00Z',
});
const key = tripKeys.expenses('trip');
let client: QueryClient;
const extraClients: QueryClient[] = [];
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  onlineManager.setOnline(true);
  client = makeClient();
  registerOfflineMutationDefaults(client);
});
afterEach(() => {
  client.clear();
  for (const extra of extraClients) extra.clear();
  extraClients.length = 0;
  onlineManager.setOnline(true);
});
describe('expense optimistic and offline acceptance', () => {
  it('shows an immediate placeholder and reconciles to the committed DTO', async () => {
    let resolve!: (value: unknown) => void;
    createExpense.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const { result } = renderHook(() => useExpenseMutations('trip'), { wrapper });
    act(() => result.current.create.mutate(vars));
    await waitFor(() =>
      expect(client.getQueryData<Expense[]>(key)?.[0].id).toMatch(/^optimistic_/)
    );
    expect(result.current.create.isPending).toBe(true);
    await act(async () => {
      resolve({ success: true, data: saved });
    });
    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(client.getQueryData(key)).toEqual([saved]);
  });
  it.each(['transport', 'server'])(
    'retries an ambiguous %s failure using one request key',
    async (failure) => {
      if (failure === 'transport')
        createExpense.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      else
        createExpense.mockResolvedValueOnce({
          success: false,
          code: 'INTERNAL_ERROR',
          error: 'INTERNAL_ERROR',
        });
      createExpense.mockResolvedValueOnce({ success: true, data: saved });
      const { result } = renderHook(() => useExpenseMutations('trip'), { wrapper });
      act(() => result.current.create.mutate(vars));
      await waitFor(() => expect(result.current.create.failureCount).toBe(1));
      expect(client.getQueryData<Expense[]>(key)?.[0].id).toMatch(/^optimistic_/);
      await waitFor(() => expect(result.current.create.isSuccess).toBe(true), { timeout: 3000 });
      expect(createExpense).toHaveBeenCalledTimes(2);
      expect(createExpense.mock.calls[1][1]).toEqual(createExpense.mock.calls[0][1]);
      expect(client.getQueryData(key)).toEqual([saved]);
      expect(vars.input).not.toHaveProperty('client_request_id');
    }
  );
  it('does not send a delayed retry after logout clears the mutation cache', async () => {
    createExpense.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useExpenseMutations('trip'), { wrapper });
    act(() => result.current.create.mutate(vars));
    await waitFor(() => expect(result.current.create.failureCount).toBe(1));
    act(() => client.clear());
    await waitFor(() => expect(result.current.create.isError).toBe(true), { timeout: 3000 });
    expect(createExpense).toHaveBeenCalledOnce();
  });
  it('allocates distinct keys when submitting the same form object twice', async () => {
    createExpense.mockResolvedValue({ success: true, data: saved });
    const { result } = renderHook(() => useExpenseMutations('trip'), { wrapper });
    await act(async () => {
      await result.current.create.mutateAsync(vars);
    });
    await act(async () => {
      await result.current.create.mutateAsync(vars);
    });
    expect(createExpense.mock.calls[0][1].client_request_id).not.toBe(
      createExpense.mock.calls[1][1].client_request_id
    );
    expect(vars.input).not.toHaveProperty('client_request_id');
  });
  it('removes the placeholder even when no cache existed before a rejected create', async () => {
    createExpense.mockResolvedValue({ success: false, error: 'VALIDATION_ERROR' });
    const { result } = renderHook(() => useExpenseMutations('trip'), { wrapper });
    act(() => result.current.create.mutate(vars));
    await waitFor(() => expect(result.current.create.isError).toBe(true));
    expect(client.getQueryData(key)).toEqual([]);
  });
  it('rolls back its shell projection on failure', async () => {
    const shell = { expense_count: 1, total_spent: 10, today_spent: 10 } as TripShell;
    client.setQueryData(tripKeys.shell('trip'), shell);
    client.setQueryData(tripKeys.currentUser, { id: 'user' });
    createExpense.mockResolvedValue({ success: false, error: 'FAILED' });
    const { result } = renderHook(() => useExpenseMutations('trip'), { wrapper });
    act(() => result.current.create.mutate(vars));
    await waitFor(() => expect(result.current.create.isError).toBe(true));
    expect(client.getQueryData(tripKeys.shell('trip'))).toEqual(shell);
  });
  it('does not erase a different concurrent successful create when an older create fails', async () => {
    let fail!: (value: unknown) => void;
    createExpense.mockReturnValueOnce(
      new Promise((r) => {
        fail = r;
      })
    );
    const { result } = renderHook(() => useExpenseMutations('trip'), { wrapper });
    act(() => result.current.create.mutate(vars));
    await waitFor(() => expect(createExpense).toHaveBeenCalledOnce());
    createExpense.mockResolvedValueOnce({ success: true, data: saved });
    act(() =>
      result.current.create.mutate({ ...vars, input: { ...vars.input, description: 'Second' } })
    );
    await waitFor(() =>
      expect(client.getQueryData<Expense[]>(key)?.some((item) => item.id === 'saved')).toBe(true)
    );
    await act(async () => {
      fail({ success: false, error: 'FAILED' });
    });
    await waitFor(() => expect(client.getQueryData(key)).toEqual([saved]));
  });
  it.each([
    { success: true, newerShell: false },
    { success: false, newerShell: false },
    { success: false, newerShell: true },
  ])(
    'reconciles a persisted mutation: success=$success, newerShell=$newerShell',
    async ({ success, newerShell }) => {
      const shell = {
        expense_count: 1,
        total_spent: 10,
        today_spent: 10,
        currency_settings: { default_currency: 'TWD', currencies: [{ code: 'TWD', rate: null }] },
      } as TripShell;
      client.setQueryData(tripKeys.shell('trip'), shell);
      client.setQueryData(tripKeys.currentUser, { id: 'user' });
      onlineManager.setOnline(false);
      const { result, unmount } = renderHook(() => useExpenseMutations('trip'), { wrapper });
      act(() => result.current.create.mutate(vars));
      await waitFor(() => expect(result.current.create.isPaused).toBe(true));
      await waitFor(() => expect(client.getQueryData<Expense[]>(key)?.length).toBe(1));
      expect(createExpense).not.toHaveBeenCalled();
      const projectedShell = client.getQueryData(tripKeys.shell('trip'));
      const snapshot = JSON.parse(JSON.stringify(dehydrate(client)));
      unmount();
      client.clear();
      const resumed = makeClient();
      extraClients.push(resumed);
      registerOfflineMutationDefaults(resumed);
      hydrate(resumed, snapshot);
      const refreshedShell = { ...shell, name: 'Updated trip', expense_count: 5, total_spent: 500 };
      if (newerShell) resumed.setQueryData(tripKeys.shell('trip'), refreshedShell);
      createExpense.mockResolvedValue(
        success ? { success: true, data: saved } : { success: false, error: 'FAILED' }
      );
      onlineManager.setOnline(true);
      await resumed.resumePausedMutations();
      expect(createExpense).toHaveBeenCalledExactlyOnceWith(
        vars.tripId,
        expect.objectContaining({ ...vars.input, client_request_id: expect.any(String) })
      );
      expect(resumed.getQueryData(key)).toEqual(success ? [saved] : []);
      expect(resumed.getQueryData(tripKeys.shell('trip'))).toEqual(
        newerShell ? refreshedShell : success ? projectedShell : shell
      );
      expect(resumed.getMutationCache().getAll()[0].state.status).toBe(
        success ? 'success' : 'error'
      );
    }
  );
});
