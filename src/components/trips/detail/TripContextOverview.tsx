'use client';

import {
  ArrowRight,
  CalendarCheck2,
  Camera,
  ListChecks,
  ReceiptText,
  Route,
  WalletCards,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Checklist, Expense, ItineraryDay, Settlement, Trip } from '@/types';
import { ROUTES } from '@/constants/routes';
import { formatCurrency } from '@/constants/currencies';
import { getTripPhase } from '@/lib/tripStatus';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface TripContextOverviewProps {
  trip: Trip;
  days: ItineraryDay[];
  expenses: Expense[];
  checklists: Checklist[];
  settlement: Settlement;
  isMember: boolean;
  onAddExpense: () => void;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function TripContextOverview({
  trip,
  days,
  expenses,
  checklists,
  settlement,
  isMember,
  onAddExpense,
}: TripContextOverviewProps) {
  const t = useTranslations('trip.context');
  const phase = getTripPhase(trip.start_date, trip.end_date);
  const todayKey = localDateKey(new Date());
  const incompleteItems = checklists.reduce(
    (count, checklist) => count + checklist.items.filter((item) => !item.done).length,
    0
  );
  const currentDay =
    phase.phase === 'ongoing' ? days.find((day) => day.day_number === phase.day) : undefined;
  const currentTime = new Date().toTimeString().slice(0, 5);
  const nextActivity =
    currentDay?.activities.find((activity) => !activity.time || activity.time >= currentTime) ??
    currentDay?.activities[0];
  const firstPlannedActivity = days.flatMap((day) => day.activities)[0];
  const todaySpent = expenses
    .filter((expense) => expense.date.slice(0, 10) === todayKey)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const outstanding = settlement.transactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0
  );

  const heading =
    phase.phase === 'ongoing'
      ? t('ongoingTitle', { day: phase.day ?? 1 })
      : phase.phase === 'postTrip'
        ? t('postTripTitle')
        : phase.daysUntil === null
          ? t('planningTitle')
          : t('preTripTitle', { days: phase.daysUntil });

  return (
    <Card className="mb-4 overflow-hidden border-primary/15 bg-primary/[0.025]">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge variant="secondary" className="mb-2">
              {t(`phase.${phase.phase}`)}
            </Badge>
            <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
          </div>
          {phase.phase === 'ongoing' ? (
            <Route className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          ) : phase.phase === 'postTrip' ? (
            <WalletCards className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          ) : (
            <CalendarCheck2 className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          )}
        </div>

        {phase.phase === 'preTrip' && (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-background/80 p-3">
                <span className="block text-muted-foreground">{t('openTasks')}</span>
                <span className="mt-1 block font-semibold">
                  {t('taskCount', { count: incompleteItems })}
                </span>
              </div>
              <div className="rounded-lg bg-background/80 p-3">
                <span className="block text-muted-foreground">{t('nextPlan')}</span>
                <span className="mt-1 block truncate font-semibold">
                  {firstPlannedActivity?.title ?? t('noPlan')}
                </span>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link href={ROUTES.TRIP_CHECKLISTS(trip.hash_code)}>
                <ListChecks className="mr-2 h-4 w-4" />
                {t('viewChecklist')}
              </Link>
            </Button>
          </>
        )}

        {phase.phase === 'ongoing' && (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-background/80 p-3">
                <span className="block text-muted-foreground">{t('nextActivity')}</span>
                <span className="mt-1 block truncate font-semibold">
                  {nextActivity
                    ? [nextActivity.time, nextActivity.title].filter(Boolean).join(' · ')
                    : t('noActivityToday')}
                </span>
              </div>
              <div className="rounded-lg bg-background/80 p-3">
                <span className="block text-muted-foreground">{t('todaySpent')}</span>
                <span className="mt-1 block font-semibold tabular-nums">
                  {formatCurrency(todaySpent, 'TWD')}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {isMember && (
                <Button onClick={onAddExpense}>
                  <ReceiptText className="mr-2 h-4 w-4" />
                  {t('quickExpense')}
                </Button>
              )}
              {currentDay && (
                <Button variant="outline" asChild>
                  <a href="#trip-today">
                    {t('viewToday')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </>
        )}

        {phase.phase === 'postTrip' && (
          <>
            <div className="rounded-lg bg-background/80 p-3 text-sm">
              <span className="block text-muted-foreground">{t('outstanding')}</span>
              <span className="mt-1 block font-semibold tabular-nums">
                {formatCurrency(outstanding, 'TWD')}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={ROUTES.TRIP_SETTLEMENT(trip.hash_code)}>
                  <WalletCards className="mr-2 h-4 w-4" />
                  {t('viewSettlement')}
                </Link>
              </Button>
              {isMember && (
                <Button variant="outline" asChild>
                  <Link href={ROUTES.TRIP_ALBUM(trip.hash_code)}>
                    <Camera className="mr-2 h-4 w-4" />
                    {t('viewAlbum')}
                  </Link>
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
