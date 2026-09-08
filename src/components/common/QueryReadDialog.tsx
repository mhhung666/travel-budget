'use client';

import { useTranslations } from 'next-intl';
import { ResponsiveFormSheet } from './ResponsiveFormSheet';
import { QueryStatus } from './QueryStatus';
import type { ReadState } from '@/lib/queryReadState';
import { ErrorState } from './ErrorState';

/** A failed/paused form bootstrap must remain dismissible, not an infinite overlay. */
export function QueryReadDialog({ query, onClose }: { query: ReadState; onClose: () => void }) {
  const t = useTranslations('common');
  return (
    <ResponsiveFormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t(
        query.isError || (query.data !== undefined && !query.isFetching && !query.isPaused)
          ? 'errorTitle'
          : 'loading'
      )}
      description={t('loading')}
    >
      {query.data !== undefined && !query.isError && !query.isFetching && !query.isPaused ? (
        <ErrorState message={t('queryLoadFailed')} onRetry={() => void query.refetch()} />
      ) : (
        <QueryStatus query={query} />
      )}
    </ResponsiveFormSheet>
  );
}
