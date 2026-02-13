'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { ItineraryDayCard, ItineraryDayDialog } from '@/components/trips/detail/itinerary';
import type { ItineraryDay } from '@/types';
import {
  getItinerary,
  createItineraryDay,
  updateItineraryDay,
  deleteItineraryDay,
} from '@/actions';
import { useTripData } from '@/hooks/useTripData';

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

  const { toast } = useToast();

  const {
    data: days,
    members,
    currentUser,
    loading,
    error,
    reload,
    isAdmin,
  } = useTripData<ItineraryDay[]>(tripId, {
    serverAction: getItinerary,
    publicEndpoint: { path: 'itinerary', responseKey: 'itinerary' },
    defaultValue: [],
  }, tItinerary('loadFailed'));

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [editingDay, setEditingDay] = useState<ItineraryDay | null>(null);
  const [deletingDay, setDeletingDay] = useState<ItineraryDay | null>(null);

  const tCommon = useTranslations('common');

  const handleAddDay = () => {
    setDialogMode('add');
    setEditingDay(null);
    setDialogOpen(true);
  };

  const handleEditDay = (day: ItineraryDay) => {
    setDialogMode('edit');
    setEditingDay(day);
    setDialogOpen(true);
  };

  const handleDeleteDay = (dayId: number) => {
    const day = days.find((d) => d.id === dayId);
    if (day) setDeletingDay(day);
  };

  const confirmDelete = async () => {
    if (!deletingDay) return;
    try {
      const result = await deleteItineraryDay(tripId, deletingDay.id);
      if (!result.success) throw new Error(result.error);

      toast({
        title: tItinerary('success.deleted', { dayNumber: deletingDay.day_number }),
      });
      setDeletingDay(null);
      await reload();
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive"
      });
    }
  };

  const handleDialogSubmit = async (data: { title: string; content: string }) => {
    if (dialogMode === 'add') {
      const newDayNumber = days.length + 1;
      const result = await createItineraryDay(tripId, data);
      if (!result.success) throw new Error(result.error);
      toast({
        title: tItinerary('success.created', { dayNumber: newDayNumber }),
      });
    } else if (editingDay) {
      const result = await updateItineraryDay(tripId, editingDay.id, data);
      if (!result.success) throw new Error(result.error);
      toast({
        title: tItinerary('success.updated', { dayNumber: editingDay.day_number }),
      });
    }
    await reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
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
          <h1 className="text-3xl font-bold">
            {tItinerary('title')}
          </h1>
          {isAdmin && (
            <Button
              onClick={handleAddDay}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {tItinerary('addDay')}
            </Button>
          )}
        </div>

        {/* Day cards */}
        {days.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
            <h3 className="text-xl font-semibold mb-2">
              {tItinerary('emptyState')}
            </h3>
            <p className="text-muted-foreground">
              {tItinerary('emptyStateHint')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {days.map((day) => (
              <ItineraryDayCard
                key={day.id}
                day={day}
                isAdmin={isAdmin}
                onEdit={handleEditDay}
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
        day={editingDay}
        dayNumber={dialogMode === 'edit' ? editingDay?.day_number : days.length + 1}
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
