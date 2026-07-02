'use client';

import { useMemo, useState } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useTrips, useTripArchiveMutations, tripKeys } from '@/hooks/queries';
import CreateTripDialog from '@/components/trips/CreateTripDialog';
import JoinTripDialog from '@/components/trips/JoinTripDialog';
import TripList from '@/components/trips/TripList';
import EmptyTripsState from '@/components/trips/EmptyTripsState';
import { TripsPageSkeleton } from '@/components/skeletons';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { TripWithMembers } from '@/types';

export default function TripsPage() {
  const t = useTranslations('trips');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: trips = [], isLoading: loading } = useTrips();
  const { archive, unarchive } = useTripArchiveMutations();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const { activeTrips, archivedTrips } = useMemo(
    () => ({
      activeTrips: trips.filter((trip) => trip.archived_at == null),
      archivedTrips: trips.filter((trip) => trip.archived_at != null),
    }),
    [trips]
  );

  const reloadTrips = () => queryClient.invalidateQueries({ queryKey: tripKeys.list });

  const toggleArchive = async (trip: TripWithMembers) => {
    const isArchived = trip.archived_at != null;
    try {
      if (isArchived) {
        await unarchive.mutateAsync(trip.id);
        toast({
          description: t('unarchiveSuccess'),
          variant: 'success',
        });
      } else {
        await archive.mutateAsync(trip.id);
        toast({ description: t('archiveSuccess') });
      }
    } catch {
      toast({ variant: 'destructive', description: t('archiveFailed') });
    }
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

  if (loading) {
    return <TripsPageSkeleton />;
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      {/* 5.1：假 Card 版型移除，行程卡直接鋪在頁面上 */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('list')}</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowJoinModal(true)} variant="outline" className="gap-2">
            <UserPlus size={16} />
            {t('joinTrip')}
          </Button>
          {/* 行動端「建立行程」由 FAB 承擔（見下） */}
          <Button onClick={() => setShowCreateModal(true)} className="gap-2 max-md:hidden">
            <Plus size={16} />
            {t('createTrip')}
          </Button>
        </div>
      </div>

      {trips.length === 0 ? (
        <EmptyTripsState />
      ) : archivedTrips.length === 0 ? (
        // 沒有任何封存時維持單一列表，不顯示分頁籤
        <TripList trips={activeTrips} onCopyCode={copyHashCode} onToggleArchive={toggleArchive} />
      ) : (
        <Tabs defaultValue="active">
          <TabsList className="mb-6">
            <TabsTrigger value="active">
              {t('tabActive')} ({activeTrips.length})
            </TabsTrigger>
            <TabsTrigger value="archived">
              {t('tabArchived')} ({archivedTrips.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {activeTrips.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">{t('noActiveTrips')}</p>
            ) : (
              <TripList
                trips={activeTrips}
                onCopyCode={copyHashCode}
                onToggleArchive={toggleArchive}
              />
            )}
          </TabsContent>

          <TabsContent value="archived">
            <TripList
              trips={archivedTrips}
              onCopyCode={copyHashCode}
              onToggleArchive={toggleArchive}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* FAB：建立行程（行動端；桌機用頁首按鈕） */}
      <Button
        onClick={() => setShowCreateModal(true)}
        aria-label={t('createTrip')}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 h-14 w-14 rounded-full shadow-lg md:hidden [&_svg]:size-6"
      >
        <Plus />
      </Button>

      {/* Create Trip Dialog */}
      <CreateTripDialog
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={reloadTrips}
      />

      {/* Join Trip Dialog */}
      <JoinTripDialog
        open={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onSuccess={() => {
          toast({
            description: t('join.success'),
            variant: 'success',
          });
          reloadTrips();
        }}
      />
    </div>
  );
}
