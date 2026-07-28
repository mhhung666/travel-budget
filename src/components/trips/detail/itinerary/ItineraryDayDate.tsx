'use client';

import { AlertTriangle, CalendarDays } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { intlLocale } from '@/lib/relativeTime';
import { cn } from '@/lib/utils';

export function ItineraryDayDate({
  date,
  outsideTripRange = false,
  className,
}: {
  /** 由旅程開始日與 day number 推算的 YYYY-MM-DD；沒有開始日時為 null。 */
  date?: string | null;
  outsideTripRange?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('itinerary');

  if (!date) return null;

  const formatted = new Intl.DateTimeFormat(intlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs',
        outsideTripRange ? 'text-warning' : 'text-muted-foreground',
        className
      )}
    >
      <span className="inline-flex items-center gap-1">
        <CalendarDays className="h-3 w-3 shrink-0" />
        <time dateTime={date}>{formatted}</time>
      </span>
      {outsideTripRange && (
        <span className="inline-flex items-center gap-1 font-medium">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {t('dateOutsideRange')}
        </span>
      )}
    </div>
  );
}
