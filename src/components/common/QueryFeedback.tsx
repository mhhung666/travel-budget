'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ErrorState } from './ErrorState';

/** Keep cached content visible; reserve the full error state for a cold failure. */
export function QueryFeedback({
  hasData,
  isError,
  isFetching,
  isPaused = false,
  onRetry,
}: {
  hasData: boolean;
  isError: boolean;
  isFetching: boolean;
  isPaused?: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('common');
  if (!hasData && isError && !isFetching && !isPaused) {
    return <ErrorState message={t('queryLoadFailed')} onRetry={onRetry} />;
  }
  if (isPaused || isFetching) {
    return (
      <p role="status" className="py-2 text-sm text-muted-foreground">
        {t(isPaused ? 'queryPaused' : hasData ? 'queryRefreshing' : 'loading')}
      </p>
    );
  }
  if (hasData && isError) {
    return (
      <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span>{t('queryRefreshFailed')}</span>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
      </div>
    );
  }
  return null;
}
