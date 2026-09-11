'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
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
  if (isPaused) {
    return (
      <p role="status" className="py-2 text-sm text-muted-foreground">
        {t('queryPaused')}
      </p>
    );
  }
  if (hasData && isFetching) {
    return (
      <div role="status" className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{t('queryRefreshing')}</span>
      </div>
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
