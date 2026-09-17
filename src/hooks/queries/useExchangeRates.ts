'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Currency exchange rates from the /api/exchange-rates proxy.
 *
 * Not trip-scoped, so it lives outside the tripKeys tree. Rates move slowly —
 * a long staleTime avoids refetching on every settlement view. Always includes
 * a TWD: 1 base so consumers have a usable default before/if the fetch fails.
 */
export function useExchangeRates() {
  const query = useQuery({
    queryKey: ['exchangeRates', 'frankfurter'],
    queryFn: async (): Promise<{
      rates: Record<string, number>;
      dates: Record<string, string>;
    }> => {
      const res = await fetch('/api/exchange-rates');
      if (!res.ok) throw new Error('Failed to load exchange rates');
      const data = await res.json();
      if (data.success && data.rates) return { rates: data.rates, dates: data.dates ?? {} };
      throw new Error('Failed to load exchange rates');
    },
    staleTime: 15 * 60_000,
    placeholderData: { rates: { TWD: 1 }, dates: {} },
  });
  return { ...query, data: query.data?.rates, rateDates: query.data?.dates ?? {} };
}
