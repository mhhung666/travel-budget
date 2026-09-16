'use client';

import { useState } from 'react';
import {
  CalendarRange,
  Camera,
  ChevronDown,
  Edit2,
  ListChecks,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Checklist, ItineraryDay, Settlement, Trip } from '@/types';
import { ROUTES } from '@/constants/routes';
import { formatCurrency } from '@/constants/currencies';
import { getTripPhase } from '@/lib/tripStatus';
import { sortActivities } from '@/lib/itineraryActivities';
import { cn } from '@/lib/utils';

import TripDestination from '@/components/trips/TripDestination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface TripContextOverviewProps {
  trip: Trip;
  days: ItineraryDay[];
  todaySpent: number;
  /** 行前才查；undefined＝尚未載入，不顯示清單狀態。 */
  checklists?: Checklist[];
  /** 旅後才查；undefined＝尚未載入，不顯示結算狀態。 */
  settlement?: Settlement;
  isMember: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onAddExpense: () => void;
}

/**
 * 行程落點的精簡頁首：目的地／日期一列，行前／旅中／旅後狀態縮成一列，
 * 描述收在展開區。讓第一屏盡快露出每日行程。
 */
export default function TripContextOverview({
  trip,
  days,
  todaySpent,
  checklists,
  settlement,
  isMember,
  isAdmin,
  onEdit,
  onAddExpense,
}: TripContextOverviewProps) {
  const t = useTranslations('trip.context');
  const tTrip = useTranslations('trip');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const dateLocale = locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale;
  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(dateLocale) : '';

  const phase = getTripPhase(trip.start_date, trip.end_date);
  const hasDates = Boolean(trip.start_date || trip.end_date);

  // 狀態列文字依階段組合，以「·」串成一句
  const summary: string[] = [];
  let currentDayNumber: number | null = null;

  if (phase.phase === 'preTrip') {
    if (phase.daysUntil !== null) summary.push(t('startsIn', { days: phase.daysUntil }));
    else if (!hasDates) summary.push(t('noDates'));
    const items = checklists?.flatMap((checklist) => checklist.items) ?? [];
    if (items.length > 0) {
      const incomplete = items.filter((item) => !item.done).length;
      summary.push(incomplete === 0 ? t('checklistDone') : t('tasksLeft', { count: incomplete }));
    }
  } else if (phase.phase === 'ongoing') {
    summary.push(t('ongoingDay', { day: phase.day ?? 1 }));
    const currentDay = days.find((day) => day.day_number === phase.day);
    if (currentDay) currentDayNumber = currentDay.day_number;
    const activities = currentDay ? sortActivities(currentDay.activities) : [];
    const currentTime = new Date().toTimeString().slice(0, 5);
    const nextActivity =
      activities.find((activity) => !activity.time || activity.time >= currentTime) ??
      activities[0];
    summary.push(
      nextActivity
        ? t('nextActivity', {
            activity: [nextActivity.time, nextActivity.title].filter(Boolean).join(' '),
          })
        : t('noActivityToday')
    );
    if (isMember) summary.push(t('todaySpent', { amount: formatCurrency(todaySpent, 'TWD') }));
  } else if (settlement) {
    const outstanding = settlement.transactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0
    );
    summary.push(
      outstanding > 0
        ? t('outstanding', { amount: formatCurrency(outstanding, 'TWD') })
        : t('settled')
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section aria-label={tTrip('info')} className="mb-3 rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <TripDestination destination={trip.destination_location} truncate />
            {hasDates && (
              <span className="flex items-center gap-1.5 tabular-nums">
                <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {formatDate(trip.start_date)}
                {trip.start_date && trip.end_date && ' – '}
                {formatDate(trip.end_date)}
              </span>
            )}
          </div>
          <div className="-my-1 -mr-2 flex shrink-0 items-center">
            {isAdmin && (
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                onClick={onEdit}
                aria-label={tCommon('edit')}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
            {trip.description && (
              <CollapsibleTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  aria-label={open ? tCommon('hideDetails') : tCommon('moreDetails')}
                >
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
                  />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* 窄螢幕讓狀態句獨佔一列，旅中「下一個活動」不被按鈕擠到截斷 */}
          <div className="flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-auto">
            <Badge variant="secondary" className="shrink-0">
              {t(`phase.${phase.phase}`)}
            </Badge>
            {summary.length > 0 && (
              <p className="min-w-0 text-sm font-medium text-foreground sm:truncate">
                {summary.join(' · ')}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {phase.phase === 'preTrip' && (
              <Button variant="outline" size="sm" asChild>
                <Link href={ROUTES.TRIP_CHECKLISTS(trip.hash_code)}>
                  <ListChecks className="h-4 w-4" />
                  {t('viewChecklist')}
                </Link>
              </Button>
            )}
            {phase.phase === 'ongoing' && (
              <>
                {currentDayNumber !== null && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`#itinerary-day-${currentDayNumber}`}>{t('viewToday')}</a>
                  </Button>
                )}
                {isMember && (
                  <Button size="sm" onClick={onAddExpense}>
                    <ReceiptText className="h-4 w-4" />
                    {t('quickExpense')}
                  </Button>
                )}
              </>
            )}
            {phase.phase === 'postTrip' && (
              <>
                {isMember && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={ROUTES.TRIP_ALBUM(trip.hash_code)}>
                      <Camera className="h-4 w-4" />
                      {t('viewAlbum')}
                    </Link>
                  </Button>
                )}
                <Button size="sm" asChild>
                  <Link href={ROUTES.TRIP_SETTLEMENT(trip.hash_code)}>
                    <WalletCards className="h-4 w-4" />
                    {t('viewSettlement')}
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>

        <CollapsibleContent>
          {trip.description && (
            <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{trip.description}</p>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
