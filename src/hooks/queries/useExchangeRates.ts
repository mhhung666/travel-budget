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
  return useQuery({
    queryKey: ['exchangeRates'],
    queryFn: async (): Promise<Record<string, number>> => {
      const res = await fetch('/api/exchange-rates');
      if (!res.ok) throw new Error('Failed to load exchange rates');
      const data = await res.json();
      if (data.success && data.rates) return data.rates;
      return { TWD: 1 };
    },
    staleTime: 60 * 60_000,
    placeholderData: { TWD: 1 },
  });
}
