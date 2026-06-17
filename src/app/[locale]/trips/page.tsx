'use client';

import { useMemo, useState } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser, useTrips, useTripArchiveMutations, tripKeys } from '@/hooks/queries';
import Navbar from '@/components/layout/Navbar';
import CreateTripDialog from '@/components/trips/CreateTripDialog';
import JoinTripDialog from '@/components/trips/JoinTripDialog';
import TripList from '@/components/trips/TripList';
import EmptyTripsState from '@/components/trips/EmptyTripsState';
import { TripsPageSkeleton } from '@/components/skeletons';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { TripWithMembers } from '@/types';

export default function TripsPage() {
  const t = useTranslations('trips');
  const tNav = useTranslations('nav');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUser();
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
          className: 'bg-green-500 text-white border-green-600',
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
        className: 'bg-green-500 text-white border-green-600',
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
    <div className="min-h-screen bg-background">
      <Navbar
        user={
          user
            ? {
                id: user.id,
                username: user.display_name,
                email: user.email,
              }
            : null
        }
        showUserMenu={true}
        title={tNav('trips')}
      />

      <div className="container mx-auto px-4 pt-24 pb-8 max-w-6xl">
        <Card className="border-none shadow-none bg-transparent sm:bg-card sm:border sm:shadow-sm">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-0 sm:px-6">
            <CardTitle className="text-2xl font-bold">{t('list')}</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button onClick={() => setShowJoinModal(true)} variant="outline" className="gap-2">
                <UserPlus size={16} />
                {t('joinTrip')}
              </Button>
              <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                <Plus size={16} />
                {t('createTrip')}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="px-0 sm:px-6">
            {trips.length === 0 ? (
              <EmptyTripsState />
            ) : archivedTrips.length === 0 ? (
              // 沒有任何封存時維持單一列表，不顯示分頁籤
              <TripList
                trips={activeTrips}
                onCopyCode={copyHashCode}
                onToggleArchive={toggleArchive}
              />
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
          </CardContent>
        </Card>
      </div>

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
            className: 'bg-green-500 text-white border-green-600',
          });
          reloadTrips();
        }}
      />
    </div>
  );
}
