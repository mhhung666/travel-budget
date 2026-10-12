'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { useTrips, useTripArchiveMutations, tripKeys } from '@/hooks/queries';
import {
  CreateTripDialog,
  JoinTripDialog,
  TripExpenseQuickAdd,
} from '@/components/trips/DeferredDialogs';
import TripList from '@/components/trips/TripList';
import EmptyTripsState from '@/components/trips/EmptyTripsState';
import { TripsPageSkeleton } from '@/components/skeletons';
import { QueryFeedback } from '@/components/common/QueryFeedback';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { TripWithMembers } from '@/types';
import { ActionQueryError } from '@/lib/actionQuery';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export default function TripsPage() {
  const router = useRouter();
  const t = useTranslations('trips');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const online = useOnlineStatus();
  const [tab, setTab] = useState('active');
  const [archiveTarget, setArchiveTarget] = useState<TripWithMembers | null>(null);
  const [archiveError, setArchiveError] = useState(false);
  const [archiveSending, setArchiveSending] = useState(false);
  const sending = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const activeTab = useRef<HTMLButtonElement>(null);
  const archivedTab = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const tripsQuery = useTrips();
  const { data: trips = [], isLoading: loading } = tripsQuery;
  const { archive, unarchive } = useTripArchiveMutations();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  // 卡片「記一筆」選定的旅行（hash_code）；null＝表單關閉。
  const [quickExpenseTrip, setQuickExpenseTrip] = useState<string | null>(null);
  const openQuickExpense = (trip: TripWithMembers) => setQuickExpenseTrip(trip.hash_code);

  const { activeTrips, archivedTrips } = useMemo(
    () => ({
      activeTrips: trips.filter((trip) => trip.archived_at == null),
      archivedTrips: trips.filter((trip) => trip.archived_at != null),
    }),
    [trips]
  );

  const reloadTrips = () => queryClient.invalidateQueries({ queryKey: tripKeys.list });

  const denied =
    tripsQuery.error instanceof ActionQueryError &&
    ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(tripsQuery.error.code ?? '');
  const selectedTrip =
    denied || !archiveTarget
      ? undefined
      : trips.find(
          (trip) => trip.id === archiveTarget.id && trip.archived_at === archiveTarget.archived_at
        );
  // Clear a vanished target immediately; it must not reopen if a later refresh brings it back.
  if (archiveTarget && !selectedTrip) setArchiveTarget(null);
  const requestArchive = (trip: TripWithMembers) => {
    if (!online || sending.current) return;
    setArchiveError(false);
    setArchiveTarget(trip);
  };
  const toggleArchive = async () => {
    if (!selectedTrip || sending.current || !online || !navigator.onLine) return;
    const current = queryClient
      .getQueryData<TripWithMembers[]>(tripKeys.list)
      ?.find((trip) => trip.id === selectedTrip.id);
    if (!current || current.archived_at !== selectedTrip.archived_at) return;
    sending.current = true;
    setArchiveSending(true);
    try {
      const isArchived = selectedTrip.archived_at != null;
      await (isArchived ? unarchive : archive).mutateAsync(selectedTrip.id);
      if (!mounted.current) return;
      toast({
        description: t(isArchived ? 'unarchiveSuccess' : 'archiveSuccess'),
        variant: 'success',
      });
      setArchiveTarget(null);
    } catch {
      if (mounted.current) setArchiveError(true);
    } finally {
      sending.current = false;
      if (mounted.current) setArchiveSending(false);
    }
  };
  const restoreArchiveFocus = () => {
    (tab === 'archived' ? archivedTab.current : activeTab.current)?.focus();
    if (!(tab === 'archived' ? archivedTab.current : activeTab.current)) heading.current?.focus();
  };

  const copyHashCode = async (hashCode: string) => {
    try {
      const shareUrl = `${window.location.origin}/join/${hashCode}`;
      await navigator.clipboard.writeText(shareUrl);
      toast({
        description: t('idCopied'),
        variant: 'success',
      });
    } catch {
      toast({
        variant: 'destructive',
        description: t('copyFailed'),
      });
    }
  };

  if (loading && tripsQuery.data === undefined) {
    return <TripsPageSkeleton />;
  }

  const feedback = (
    <QueryFeedback
      hasData={tripsQuery.data !== undefined && !denied}
      isError={tripsQuery.isError}
      isFetching={tripsQuery.isFetching}
      isPaused={tripsQuery.isPaused}
      onRetry={() => void tripsQuery.refetch()}
    />
  );

  if (tripsQuery.data === undefined || denied) return feedback;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      {feedback}
      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('title')}
        </h1>
        {trips.length > 0 && (
          <div className="col-start-2 row-start-1 min-w-0 md:col-start-3">
            <Button
              onClick={() => setShowCreateModal(true)}
              disabled={!online}
              variant="outline"
              className="min-h-12 whitespace-normal gap-2"
            >
              <Plus size={16} />
              {t('createTrip')}
            </Button>
          </div>
        )}
        {trips.length > 0 && (
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 md:col-span-1 md:col-start-2 md:row-start-1">
            <span className="text-sm text-muted-foreground md:hidden">{t('joinHint')}</span>
            <Button
              onClick={() => setShowJoinModal(true)}
              disabled={!online}
              variant="ghost"
              className="min-h-12 whitespace-normal gap-2 text-primary"
            >
              <UserPlus size={16} />
              {t('joinTrip')}
            </Button>
          </div>
        )}
      </div>

      {trips.length === 0 && tab !== 'archived' ? (
        <EmptyTripsState
          onCreate={() => setShowCreateModal(true)}
          onJoin={() => setShowJoinModal(true)}
          disabled={!online}
        />
      ) : archivedTrips.length === 0 && tab !== 'archived' ? (
        // 沒有任何封存時維持單一列表，不顯示分頁籤
        <TripList
          trips={activeTrips}
          onCopyCode={copyHashCode}
          onToggleArchive={requestArchive}
          disabled={!online || archiveSending}
          onQuickExpense={openQuickExpense}
        />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (!sending.current) setTab(value);
          }}
        >
          <TabsList className="mb-6 flex h-auto justify-start gap-2 rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              ref={activeTab}
              value="active"
              disabled={archiveSending}
              className="min-h-12 whitespace-normal rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              {t('tabActive')}
              {!tripsQuery.isFetching && !tripsQuery.isError ? ` (${activeTrips.length})` : ''}
            </TabsTrigger>
            <TabsTrigger
              ref={archivedTab}
              value="archived"
              disabled={archiveSending}
              className="min-h-12 whitespace-normal rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              {t('tabArchived')}
              {!tripsQuery.isFetching && !tripsQuery.isError ? ` (${archivedTrips.length})` : ''}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {activeTrips.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">{t('noActiveTrips')}</p>
                <Button
                  variant="ghost"
                  className="mt-4 min-h-12"
                  onClick={() => setTab('archived')}
                >
                  {t('tabArchived')}
                </Button>
              </div>
            ) : (
              <TripList
                trips={activeTrips}
                onCopyCode={copyHashCode}
                onToggleArchive={requestArchive}
                disabled={!online || archiveSending}
                onQuickExpense={openQuickExpense}
              />
            )}
          </TabsContent>

          <TabsContent value="archived">
            {archivedTrips.length === 0 && (
              <p className="py-12 text-center text-muted-foreground">{t('noArchivedTrips')}</p>
            )}
            <TripList
              trips={archivedTrips}
              onCopyCode={copyHashCode}
              onToggleArchive={requestArchive}
              disabled={!online || archiveSending}
            />
          </TabsContent>
        </Tabs>
      )}

      <AlertDialog
        open={!!selectedTrip}
        onOpenChange={(open) => {
          if (!open && !sending.current) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreArchiveFocus();
          }}
          onEscapeKeyDown={(event) => {
            if (sending.current) event.preventDefault();
          }}
          className="max-h-[85dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-2xl"
        >
          <AlertDialogTitle>
            {t(selectedTrip?.archived_at != null ? 'unarchive' : 'archive')}
          </AlertDialogTitle>
          <p className="break-words font-semibold">{selectedTrip?.name}</p>
          <AlertDialogDescription>{t('archiveHint')}</AlertDialogDescription>
          {archiveError && (
            <p role="alert" className="text-sm text-destructive">
              {t('archiveFailed')}
            </p>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12" disabled={archiveSending}>
              {t('cancelArchive')}
            </AlertDialogCancel>
            <Button
              className="min-h-12 whitespace-normal"
              disabled={!online || archiveSending}
              onClick={() => void toggleArchive()}
            >
              {t(
                archiveSending
                  ? 'archiveSending'
                  : selectedTrip?.archived_at != null
                    ? 'unarchive'
                    : 'archive'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {quickExpenseTrip && (
        <TripExpenseQuickAdd
          tripId={quickExpenseTrip}
          open
          path="picker"
          onClose={() => setQuickExpenseTrip(null)}
        />
      )}

      {/* Create Trip Dialog */}
      <CreateTripDialog
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(trip) => {
          reloadTrips();
          router.push(ROUTES.TRIP_DETAIL(trip.id));
        }}
      />

      {/* Join Trip Dialog */}
      <JoinTripDialog
        open={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onSuccess={(trip) => {
          toast({
            description: t('join.success'),
            variant: 'success',
          });
          reloadTrips();

          queryClient.invalidateQueries({ queryKey: tripKeys.all(trip.id) });
          router.push(ROUTES.TRIP_DETAIL(trip.id));
        }}
      />
    </div>
  );
}
