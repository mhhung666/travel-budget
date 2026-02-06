'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { ItineraryDayCard, ItineraryDayDialog } from '@/components/trips/detail/itinerary';
import type { ItineraryDay, Member } from '@/types';
import {
  getCurrentUser,
  getItinerary,
  getMembers,
  createItineraryDay,
  updateItineraryDay,
  deleteItineraryDay,
} from '@/actions';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

export default function ItineraryPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tItinerary = useTranslations('itinerary');
  const tError = useTranslations('error');

  const { toast } = useToast();

  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [editingDay, setEditingDay] = useState<ItineraryDay | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const isCurrentUserAdmin = members.find((m) => m.id === currentUser?.id)?.role === 'admin';

  useEffect(() => {
    loadData();
  }, [tripId]);

  const loadData = async () => {
    try {
      // 嘗試檢查認證（不強制要求登入）
      let user = null;
      const userResult = await getCurrentUser();
      if (userResult.success && userResult.data) {
        user = userResult.data;
        setCurrentUser(user);
      }

      // 如果已登入，使用 Server Actions
      if (user) {
        const [itineraryResult, membersResult] = await Promise.all([
          getItinerary(tripId),
          getMembers(tripId),
        ]);

        if (!itineraryResult.success) {
          // 如果不是成員，嘗試使用公開 API
          if (itineraryResult.code === 'FORBIDDEN') {
            await loadPublicData();
            return;
          }
          setError(tItinerary('loadFailed'));
          return;
        }

        setDays(itineraryResult.data);
        setMembers(membersResult.success ? membersResult.data : []);
      } else {
        // 未登入，使用公開 API
        await loadPublicData();
      }
    } catch {
      setError(tItinerary('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadPublicData = async () => {
    const [itineraryResponse, membersResponse] = await Promise.all([
      fetch(`/api/public/trips/${tripId}/itinerary`),
      fetch(`/api/public/trips/${tripId}/members`),
    ]);

    if (!itineraryResponse.ok) {
      setError(tItinerary('loadFailed'));
      return;
    }

    const itineraryData = await itineraryResponse.json();
    const membersData = await membersResponse.json();

    setDays(itineraryData.itinerary || []);
    setMembers(membersData.members || []);
  };

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

  const handleDeleteDay = async (dayId: number) => {
    if (deleteConfirmId !== dayId) {
      setDeleteConfirmId(dayId);
      toast({
        title: "Confirm Delete",
        description: "Click trash icon again to confirm deletion.",
        variant: "destructive"
      });
      return;
    }

    try {
      const result = await deleteItineraryDay(tripId, dayId);
      if (!result.success) throw new Error(result.error);

      toast({
        title: tItinerary('success.deleted'),
      });
      setDeleteConfirmId(null);
      await loadData();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  const handleDialogSubmit = async (data: { title: string; content: string }) => {
    if (dialogMode === 'add') {
      const result = await createItineraryDay(tripId, data);
      if (!result.success) throw new Error(result.error);
      toast({
        title: tItinerary('success.created'),
      });
    } else if (editingDay) {
      const result = await updateItineraryDay(tripId, editingDay.id, data);
      if (!result.success) throw new Error(result.error);
      toast({
        title: tItinerary('success.updated'),
      });
    }
    await loadData();
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
          {isCurrentUserAdmin && (
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
                isAdmin={!!isCurrentUserAdmin}
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
      />
    </div>
  );
}
