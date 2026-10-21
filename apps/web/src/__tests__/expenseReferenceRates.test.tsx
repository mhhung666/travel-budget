import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useExpenseForm } from '@/components/trips/detail/expense-form/useExpenseForm';
import TripCurrencySettingsCard from '@/components/trips/detail/TripCurrencySettings';
import { TripLedgerProvider } from '@/components/trips/space/LedgerCurrency';
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

it.each([1 / 0.03123, 1.23456789e-7])(
  'loads and saves the full custom rate %s in a non-TWD ledger',
  async (rate) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => Response.json(snapshot))
    );
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <TripLedgerProvider value="USD">
          <TripCurrencySettingsCard
            settings={{ default_currency: 'JPY', currencies: [{ code: 'JPY', rate }] }}
            revision="original-revision"
            canEdit
            onSave={onSave}
          />
        </TripLedgerProvider>
      </QueryClientProvider>
    );
    const input = screen.getByLabelText('JPY · currencySettings.customRate') as HTMLInputElement;
    expect(input.value).toBe(String(rate));
    expect(input.checkValidity()).toBe(true);
    // Exercise editing too: a new long decimal must not be rounded on save.
    fireEvent.change(input, { target: { value: '0.2156789012345' } });
    expect(input.checkValidity()).toBe(true);
    await user.click(screen.getByRole('button', { name: 'currencySettings.save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      base_currency: 'USD',
      expected_revision: 'original-revision',
      default_currency: 'JPY',
      currencies: [{ code: 'JPY', rate: 0.2156789012345 }],
    });
    view.unmount();
    client.clear();
  }
);
