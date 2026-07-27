'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Loader2, Plus, ReceiptText } from 'lucide-react';
import type { Trip, TripWithMembers } from '@/types';
import { decideQuickAddTrip } from '@/lib/quickAdd';
import { ongoingDayNumber } from '@/lib/tripStatus';
import { useTrips, tripKeys } from '@/hooks/queries';
import { useTripSpace } from '@/hooks/useTripSpace';
import { trackProductEvent } from '@/lib/productEvents';

import { ResponsiveFormSheet } from '@/components/common';
import CreateTripDialog from '@/components/trips/CreateTripDialog';
import { ExpenseFormSheet } from '@/components/trips/detail/expense-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export const QUICK_ADD_LAST_TRIP_KEY = 'quick-add:last-trip';

interface GlobalQuickAddFlowProps {
  open: boolean;
  preferredTripId: string | null;
  onClose: () => void;
}

function rememberTrip(trip: Pick<Trip, 'id' | 'hash_code'>) {
  try {
    localStorage.setItem(QUICK_ADD_LAST_TRIP_KEY, trip.id);
  } catch {
    // Storage may be unavailable in private browsing; ranking still works without it.
  }
}

function TripPicker({
  open,
  trips,
  onSelect,
  onClose,
}: {
  open: boolean;
  trips: TripWithMembers[];
  onSelect: (trip: TripWithMembers) => void;
  onClose: () => void;
}) {
  const t = useTranslations('quickAdd');
  const tTrips = useTranslations('trips');
  const locale = useLocale();
  const intlLocale =
    locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US';

  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      title={t('pickTrip')}
      description={t('pickTripDescription')}
      desktopClassName="sm:max-w-[480px]"
    >
      <div className="space-y-2">
        <p className="mb-4 text-sm text-muted-foreground">{t('pickTripDescription')}</p>
        {trips.map((trip) => {
          const day = ongoingDayNumber(trip.start_date, trip.end_date);
          const dateLabel = [trip.start_date, trip.end_date]
            .filter(Boolean)
            .map((date) => new Date(date as string).toLocaleDateString(intlLocale))
            .join(' – ');

          return (
            <button
              key={trip.id}
              type="button"
              onClick={() => onSelect(trip)}
              className="flex min-h-16 w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ReceiptText className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{trip.name}</span>
                  {day !== null && (
                    <Badge className="shrink-0">
                      {tTrips('ongoingBadge', {
                        day,
                      })}
                    </Badge>
                  )}
                </span>
                {dateLabel && (
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                    {dateLabel}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </ResponsiveFormSheet>
  );
}

function QuickAddLoading({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('quickAdd');
  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      title={t('title')}
      description={t('loading')}
      desktopClassName="sm:max-w-[480px]"
    >
      <div className="space-y-3" aria-live="polite">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('loading')}
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </ResponsiveFormSheet>
  );
}

function GlobalExpenseForm({
  tripId,
  open,
  onClose,
  path,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
  path: 'direct' | 'picker' | 'created';
}) {
  const {
    trip,
    isLoading,
    members,
    currentUser,
    isMember,
    isMembershipLoading,
    itineraryDays,
    existingTags,
    handleAddExpense,
  } = useTripSpace(tripId);

  const ready =
    !isLoading &&
    !isMembershipLoading &&
    trip != null &&
    isMember &&
    currentUser != null &&
    members.length > 0;

  if (!ready) {
    return <QuickAddLoading open={open} onClose={onClose} />;
  }

  return (
    <ExpenseFormSheet
      mode="add"
      tripId={tripId}
      open={open}
      onClose={onClose}
      onSubmit={async (data) => {
        await handleAddExpense(data);
        trackProductEvent('quick_add_flow', { stage: 'expense_submitted', path });
        onClose();
      }}
      members={members}
      currentUser={currentUser}
      itineraryDays={itineraryDays}
      existingTags={existingTags}
      currencySettings={trip.currency_settings}
    />
  );
}

export function GlobalQuickAddFlow({ open, preferredTripId, onClose }: GlobalQuickAddFlowProps) {
  const t = useTranslations('quickAdd');
  const tTrips = useTranslations('trips');
  const queryClient = useQueryClient();
  const { data: trips = [], isLoading } = useTrips();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<'picker' | 'created'>('picker');
  const [createOpen, setCreateOpen] = useState(false);
  const measuredStage = useRef<string | null>(null);

  const decision = useMemo(
    () => decideQuickAddTrip(trips, new Date(), preferredTripId),
    [trips, preferredTripId]
  );

  const closeFlow = () => {
    setSelectedTripId(null);
    setSelectedPath('picker');
    setCreateOpen(false);
    onClose();
  };

  const selectTrip = (
    trip: Pick<Trip, 'id' | 'hash_code'>,
    path: 'picker' | 'created' = 'picker'
  ) => {
    rememberTrip(trip);
    setSelectedPath(path);
    setSelectedTripId(trip.hash_code);
  };

  const stage = !open
    ? null
    : selectedTripId
      ? `form_opened:${selectedPath}`
      : isLoading
        ? null
        : decision.kind === 'direct'
          ? 'form_opened:direct'
          : decision.kind === 'pick'
            ? 'picker_shown:picker'
            : 'trip_creation_shown:created';

  useEffect(() => {
    if (!stage) {
      if (!open) measuredStage.current = null;
      return;
    }
    if (measuredStage.current === stage) return;
    measuredStage.current = stage;
    const [eventStage, path] = stage.split(':') as [
      'picker_shown' | 'trip_creation_shown' | 'form_opened',
      'direct' | 'picker' | 'created',
    ];
    trackProductEvent('quick_add_flow', { stage: eventStage, path });
  }, [open, stage]);

  if (!open) return null;

  if (selectedTripId) {
    return (
      <GlobalExpenseForm tripId={selectedTripId} open onClose={closeFlow} path={selectedPath} />
    );
  }

  if (isLoading) {
    return <QuickAddLoading open onClose={closeFlow} />;
  }

  if (decision.kind === 'direct') {
    return (
      <GlobalExpenseForm tripId={decision.trip.hash_code} open onClose={closeFlow} path="direct" />
    );
  }

  if (decision.kind === 'pick') {
    return <TripPicker open trips={decision.trips} onSelect={selectTrip} onClose={closeFlow} />;
  }

  return (
    <>
      <ResponsiveFormSheet
        open={!createOpen}
        onOpenChange={(nextOpen) => !nextOpen && closeFlow()}
        title={t('noTripsTitle')}
        description={t('noTripsDescription')}
        desktopClassName="sm:max-w-[480px]"
      >
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ReceiptText className="h-7 w-7" aria-hidden />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">{t('noTripsDescription')}</p>
          <Button onClick={() => setCreateOpen(true)} className="mt-6 gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            {tTrips('createTrip')}
          </Button>
        </div>
      </ResponsiveFormSheet>
      <CreateTripDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(trip) => {
          void queryClient.invalidateQueries({ queryKey: tripKeys.list });
          selectTrip(trip, 'created');
        }}
      />
    </>
  );
}
