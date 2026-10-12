import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { isAccessDenied } from '@/features/auth/errorMessage';

export function resetTripPages(
  client: QueryClient,
  environment: string,
  userId: string | undefined
) {
  for (const query of client
    .getQueryCache()
    .findAll({ queryKey: [environment, userId, 'trips'] })) {
    if (isAccessDenied(query.state.error)) continue;
    client.setQueryData<InfiniteData<unknown>>(query.queryKey, (data) =>
      data && Array.isArray(data.pages) && Array.isArray(data.pageParams)
        ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
        : data
    );
  }
}
