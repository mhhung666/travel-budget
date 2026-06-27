'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Plus } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { ItineraryDayCard, ItineraryDayDialog } from '@/components/trips/detail/itinerary';
import type { LocationOption } from '@/components/location/LocationAutocomplete';
import { ExportMenu } from '@/components/export';
import type { ItineraryDay } from '@/types';
import { useItinerary, useTrip, useTripMembership, useItineraryMutations } from '@/hooks/queries';
import type { ActivityPayload } from '@/hooks/queries/useItineraryMutations';
import { exportItinerary, type ExportFormat } from '@/lib/exporters';

import { ItinerarySkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

export default function ItineraryPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tItinerary = useTranslations('itinerary');
  const tAct = useTranslations('itinerary.activities');

  const { toast } = useToast();

  const { data: days = [], isLoading: loading, isError } = useItinerary(tripId);
  const { data: trip } = useTrip(tripId);
  const { currentUser, isAdmin } = useTripMembership(tripId);
  const { create, update, remove } = useItineraryMutations(tripId);
  const tExport = useTranslations('export');

  const error = isError ? tItinerary('loadFailed') : '';

  const buildExport = (format: ExportFormat) =>
    exportItinerary(days, format, {
      heading: tExport('itinerary.heading'),
      day: (n) => tExport('itinerary.day', { n }),
      columns: {
        day: tExport('itinerary.colDay'),
        title: tExport('itinerary.colTitle'),
        content: tExport('itinerary.colContent'),
      },
      activityTypes: {
        sightseeing: tAct('types.sightseeing'),
        food: tAct('types.food'),
        transport: tAct('types.transport'),
        accommodation: tAct('types.accommodation'),
        activity: tAct('types.activity'),
        other: tAct('types.other'),
      },
    });

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [editingDay, setEditingDay] = useState<ItineraryDay | null>(null);
  // 從卡片「新增活動」開啟時為 true：對話框會自動展開活動區、補一列空白活動並捲動到位。
  const [autoAddActivity, setAutoAddActivity] = useState(false);
  const [deletingDay, setDeletingDay] = useState<ItineraryDay | null>(null);

  const tCommon = useTranslations('common');

  const handleAddDay = () => {
    setDialogMode('add');
    setEditingDay(null);
    setAutoAddActivity(false);
    setDialogOpen(true);
  };

  const handleEditDay = (day: ItineraryDay) => {
    setDialogMode('edit');
    setEditingDay(day);
    setAutoAddActivity(false);
    setDialogOpen(true);
  };

  // 卡片上的「新增活動」捷徑：直接開編輯對話框並補一列空白活動。
  const handleAddActivity = (day: ItineraryDay) => {
    setDialogMode('edit');
    setEditingDay(day);
    setAutoAddActivity(true);
    setDialogOpen(true);
  };

  const handleDeleteDay = (dayId: string) => {
    const day = days.find((d) => d.id === dayId);
    if (day) setDeletingDay(day);
  };

  const confirmDelete = async () => {
    if (!deletingDay) return;
    const dayNumber = deletingDay.day_number;
    try {
      await remove.mutateAsync(deletingDay.id);
      toast({
        title: tItinerary('success.deleted', { dayNumber }),
      });
      setDeletingDay(null);
    } catch (err: unknown) {
      toast({
        title: tCommon('errorTitle'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  const handleDialogSubmit = async (data: {
    title: string;
    content: string;
    location: LocationOption | null;
    activities: ActivityPayload[];
  }) => {
    if (dialogMode === 'add') {
      const newDayNumber = days.length + 1;
      await create.mutateAsync(data);
      toast({
        title: tItinerary('success.created', { dayNumber: newDayNumber }),
      });
    } else if (editingDay) {
      await update.mutateAsync({ dayId: editingDay.id, data });
      toast({
        title: tItinerary('success.updated', { dayNumber: editingDay.day_number }),
      });
    }
  };

  if (loading) {
    return <ItinerarySkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md w-full">
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={() => router.push(`/trips/${tripId}`)} size="lg">
            {tItinerary('backToTrip')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <Navbar
        user={
          currentUser
            ? {
                id: currentUser.id,
                username: currentUser.display_name,
                email: currentUser.email,
                avatar_url: currentUser.avatar_url,
              }
            : null
        }
        showUserMenu={true}
        title={tItinerary('title')}
      />

      <div className="container mx-auto max-w-4xl pt-24 px-4 sm:px-6">
        {/* Back button */}
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground mb-6 -ml-2"
          onClick={() => router.push(`/trips/${tripId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tItinerary('backToTrip')}
        </Button>

        {/* Header with Add button */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{tItinerary('title')}</h1>
          <div className="flex items-center gap-2">
            <ExportMenu
              build={buildExport}
              fileBaseName={`${trip?.name ?? 'trip'}-${tExport('itinerary.heading')}`}
              disabled={days.length === 0}
            />
            {isAdmin && (
              <Button onClick={handleAddDay} className="gap-2">
                <Plus className="h-4 w-4" />
                {tItinerary('addDay')}
              </Button>
            )}
          </div>
        </div>

        {/* Day cards */}
        {days.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
            <h3 className="text-xl font-semibold mb-2">{tItinerary('emptyState')}</h3>
            <p className="text-muted-foreground">{tItinerary('emptyStateHint')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {days.map((day) => (
              <ItineraryDayCard
                key={day.id}
                day={day}
                tripId={tripId}
                isAdmin={isAdmin}
                onEdit={handleEditDay}
                onAddActivity={handleAddActivity}
                onDelete={handleDeleteDay}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <ItineraryDayDialog
        mode={dialogMode}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleDialogSubmit}
        tripId={tripId}
        day={editingDay}
        dayNumber={dialogMode === 'edit' ? editingDay?.day_number : days.length + 1}
        autoAddActivity={autoAddActivity}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingDay} onOpenChange={(open) => !open && setDeletingDay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tItinerary('deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{tItinerary('deleteMessage')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tCommon('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
