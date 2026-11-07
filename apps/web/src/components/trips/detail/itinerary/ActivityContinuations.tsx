'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ItineraryContinuation } from '@travel-budget/contracts';
import { activityAnchorId } from '@/lib/itineraryContinuations';
import { Button } from '@/components/ui/button';
import { useActivityBatchSelection } from './ActivityBatchDeletion';

export function ActivityContinuations({ hints }: { hints: readonly ItineraryContinuation[] }) {
  const t = useTranslations('itinerary.continuation');
  const time = useTranslations('itinerary.timing');
  const batch = useActivityBatchSelection();
  const [gone, setGone] = useState(false);
  // The hint is never a selectable activity, even while a different day's batch is active.
  if (batch?.dayId || hints.length === 0) return null;
  return (
    <section aria-label={t('heading')} className="mt-3 space-y-2 border-t pt-3">
      {hints.map((hint) => (
        <div
          key={`${hint.sourceDayId}:${hint.activityId}`}
          className="rounded-lg bg-muted/50 p-3 [overflow-wrap:anywhere]"
        >
          <p className="text-sm">{t('source', { n: hint.sourceDayNumber, title: hint.title })}</p>
          {hint.isEndDay && (
            <p className="mt-1 text-sm text-muted-foreground">
              {hint.endTime || time('unknown')} ·{' '}
              {time(
                ['flight', 'transport', 'ground_transport'].includes(hint.type) ? 'arrival' : 'end'
              )}
            </p>
          )}
          <Button
            variant="link"
            className="h-auto min-h-11 max-w-full whitespace-normal px-0 text-left"
            aria-label={`${t('view')} · ${t('source', { n: hint.sourceDayNumber, title: hint.title })}`}
            onClick={() => {
              if (batch && !batch.canLeaveDay(hint.sourceDayId)) return;
              const row = document.getElementById(
                activityAnchorId(hint.sourceDayId, hint.activityId)
              );
              if (!row) {
                setGone(true);
                return;
              }
              setGone(false);
              row.focus({ preventScroll: true });
              row.scrollIntoView?.({
                block: 'start',
                behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                  ? 'auto'
                  : 'smooth',
              });
            }}
          >
            {t('view')} →
          </Button>
        </div>
      ))}
      {gone && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('gone')}
        </p>
      )}
    </section>
  );
}
