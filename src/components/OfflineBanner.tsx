'use client';

import { useTranslations } from 'next-intl';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Thin top banner shown while the device is offline (ROADMAP #5 Phase 1).
 *
 * Signals that the data on screen comes from the persisted cache rather than a
 * live fetch. Renders nothing when online so it has zero footprint normally.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const t = useTranslations('offline');

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[2000] flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-center text-xs font-medium text-warning-foreground shadow-sm"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>{t('banner')}</span>
    </div>
  );
}
