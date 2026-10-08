import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useExpenseForm } from '@/components/trips/detail/expense-form/useExpenseForm';
import { ROUTES } from '@/constants/routes';
const snapshot = {
  success: true,
  rates: { TWD: 1, USD: 32, JPY: 0.2 },
  dates: { USD: '2026-10-08', JPY: '2026-10-08' },
  provider: 'Frankfurter',
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(['TWD', 'USD', 'JPY'])(
  'uses the cacheable GET snapshot to prefill %s-ledger quotes',
  async (baseCurrency) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot)));
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(() =>
      useExpenseForm({
        mode: 'add',
        tripId: 'trip',
        open: false,
        members: [],
        currentUser: null,
        baseCurrency,
      })
    );
    await act(async () => {
      await result.current.fetchExchangeRates();
    });
    expect(fetcher).toHaveBeenCalledWith(ROUTES.API.EXCHANGE_RATES);
    expect(result.current.exchangeRates[baseCurrency]).toBe(1);
    const expected = baseCurrency === 'TWD' ? 0.2 : baseCurrency === 'USD' ? 0.00625 : 1;
    expect(result.current.exchangeRates.JPY).toBe(expected);
    expect(result.current.ratesError).toBe('');
  }
);
it('omits cross-rates with different publication dates and shows unavailable errors without inventing rates', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...snapshot, dates: { USD: '2026-10-07', JPY: '2026-10-08' } })
        )
      )
      .mockRejectedValueOnce(new TypeError('offline without cache'))
  );
  const { result } = renderHook(() =>
    useExpenseForm({
      mode: 'add',
      tripId: 'trip',
      open: false,
      members: [],
      currentUser: null,
      baseCurrency: 'USD',
    })
  );
  await act(async () => {
    await result.current.fetchExchangeRates();
  });
  expect(result.current.exchangeRates.JPY).toBeUndefined();
  await act(async () => {
    await result.current.fetchExchangeRates();
  });
  await waitFor(() => expect(result.current.ratesError).toBe('error.ratesLoadFailed'));
  expect(result.current.exchangeRates).toEqual({});
});
