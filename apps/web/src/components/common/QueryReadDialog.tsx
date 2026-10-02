'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
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
      ) : query.isError || query.isPaused ? (
        <QueryStatus query={query} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span>{t('loading')}</span>
        </div>
      )}
    </ResponsiveFormSheet>
  );
}
