'use client';

import { useEffect, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { tripKeys } from '@/hooks/queries/keys';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/** One delayed indicator for background reads, without moving the page content. */
export function TripRefreshIndicator({ tripId }: { tripId: string }) {
  const t = useTranslations('common');
  const online = useOnlineStatus();
  const count = useIsFetching({
    queryKey: tripKeys.all(tripId),
    type: 'active',
    predicate: (query) => query.state.data !== undefined,
  });
  const refreshing = online && count > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(refreshing), refreshing ? 600 : 0);
    return () => clearTimeout(timer);
  }, [refreshing]);

  if (!refreshing || !visible) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute right-4 top-1 z-10 flex items-center gap-1.5 rounded-full border bg-background/95 px-2 py-1 text-xs text-muted-foreground shadow-sm"
    >
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      <span>{t('queryRefreshing')}</span>
    </div>
  );
}
