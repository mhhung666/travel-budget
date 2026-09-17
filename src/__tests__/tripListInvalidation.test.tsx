import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tripKeys } from '@/hooks/queries/keys';
import { invalidateExpenseDerived } from '@/lib/offlineMutations';

const recordPayment = vi.hoisted(() => vi.fn());
const deletePayment = vi.hoisted(() => vi.fn());
const setTripBudget = vi.hoisted(() => vi.fn());
vi.mock('@/actions', () => ({
  recordPayment,
  deletePayment,
  remindPayment: vi.fn(),
  setTripBudget,
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
  regenerateHashCode: vi.fn(),
  archiveTrip: vi.fn(),
  unarchiveTrip: vi.fn(),
  setTripCurrencySettings: vi.fn(),
  createExpense: vi.fn(),
}));
vi.mock('@/lib/productEvents', () => ({ trackProductEvent: vi.fn() }));
import { usePaymentMutations } from '@/hooks/queries/usePaymentMutations';
import { useTripMutations } from '@/hooks/queries/useTripMutations';

let client: QueryClient;
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

function seedList() {
  client.setQueryData(tripKeys.list, []);
  expect(client.getQueryState(tripKeys.list)?.isInvalidated).toBe(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});

// 首頁卡片的「我的花費／結算狀態」來自 tripKeys.list，改動這些資料後必須重抓。
describe('trips list summary invalidation', () => {
  it('expense changes invalidate the trips list', () => {
    seedList();
    invalidateExpenseDerived(client, 'trip');
    expect(client.getQueryState(tripKeys.list)?.isInvalidated).toBe(true);
  });

  it('recording and deleting a payment invalidate the trips list', async () => {
    recordPayment.mockResolvedValue({ success: true, data: {} });
    deletePayment.mockResolvedValue({ success: true, data: undefined });
    const { result } = renderHook(() => usePaymentMutations('trip'), { wrapper });

    seedList();
    await act(() => result.current.record.mutateAsync({ from: 'a', to: 'b', amount: 1 } as never));
    expect(client.getQueryState(tripKeys.list)?.isInvalidated).toBe(true);

    seedList();
    await act(() => result.current.remove.mutateAsync('p1'));
    expect(client.getQueryState(tripKeys.list)?.isInvalidated).toBe(true);
  });

  it('setting the budget invalidates the trips list', async () => {
    setTripBudget.mockResolvedValue({ success: true, data: { id: 'trip' } });
    const { result } = renderHook(() => useTripMutations('trip'), { wrapper });

    seedList();
    await act(() => result.current.setBudget.mutateAsync({ budget: 100 } as never));
    expect(client.getQueryState(tripKeys.list)?.isInvalidated).toBe(true);
  });
});
