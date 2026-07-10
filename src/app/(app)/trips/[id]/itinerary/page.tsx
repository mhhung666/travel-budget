'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { CalendarDays, Eye, Pencil, Plus } from 'lucide-react';
import {
  ItineraryDayCard,
  ItineraryDayDialog,
  ActivityFormDialog,
} from '@/components/trips/detail/itinerary';
import {
  dayActivitiesToDrafts,
  draftsToPayload,
} from '@/components/trips/detail/itinerary/ActivityListEditor';
import type { LocationOption } from '@/components/location/LocationAutocomplete';
import { ExportMenu } from '@/components/export';
import type { Activity, ItineraryDay } from '@/types';
import { useItinerary, useTrip, useTripMembership, useItineraryMutations } from '@/hooks/queries';
import type { ActivityPayload } from '@/hooks/queries/useItineraryMutations';
import { exportItinerary, type ExportFormat } from '@/lib/exporters';

import { ItinerarySkeleton } from '@/components/skeletons';
import { EmptyState, ErrorState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const { isAdmin } = useTripMembership(tripId);
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

  // 閱讀/編輯模式：預設閱讀（乾淨檢視）；只有 admin 能切到編輯模式看到編輯動作。
  const [pageMode, setPageMode] = useState<'read' | 'edit'>('read');
  const editable = isAdmin && pageMode === 'edit';

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [editingDay, setEditingDay] = useState<ItineraryDay | null>(null);
  // 輕量單一活動對話框；activity 未給＝新增、給了＝編輯該筆。null＝關閉。
  const [activityDialog, setActivityDialog] = useState<{
    day: ItineraryDay;
    activity?: Activity;
  } | null>(null);
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

  // 卡片上的「新增活動」捷徑：開輕量單一活動對話框（不開整天編輯）。
  const handleAddActivity = (day: ItineraryDay) => {
    setActivityDialog({ day });
  };

  // 活動列上的「編輯」捷徑：同一個輕量對話框，預填該筆活動。
  const handleEditActivity = (day: ItineraryDay, activity: Activity) => {
    setActivityDialog({ day, activity });
  };

  // 單一活動送出：新增＝併入該天既有活動、編輯＝原位替換該筆，整批覆寫 activities
  // （updateItineraryDay 只傳 activities，其餘欄位 undefined 不動）。
  const handleActivitySubmit = async (payload: ActivityPayload) => {
    if (!activityDialog) return;
    const { day, activity } = activityDialog;
    const drafts = dayActivitiesToDrafts(day.activities);
    const activities = activity
      ? drafts.flatMap((d) => (d.key === activity.id ? [payload] : draftsToPayload([d])))
      : [...draftsToPayload(drafts), payload];
    await update.mutateAsync({ dayId: day.id, data: { activities } });
    toast({
      title: activity
        ? tAct('updatedInDay', { dayNumber: day.day_number })
        : tAct('addedToDay', { dayNumber: day.day_number }),
    });
  };

  // 活動列上的「刪除」：單筆活動可立即重加、誤刪成本低，直接刪＋toast，不跳確認框。
  const handleDeleteActivity = async (day: ItineraryDay, activity: Activity) => {
    const remaining = draftsToPayload(
      dayActivitiesToDrafts(day.activities.filter((a) => a.id !== activity.id))
    );
    try {
      await update.mutateAsync({ dayId: day.id, data: { activities: remaining } });
      toast({ title: tAct('removedFromDay', { dayNumber: day.day_number }) });
    } catch (err: unknown) {
      toast({
        title: tCommon('errorTitle'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
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
      <ErrorState
        message={error}
        onBack={() => router.push(`/trips/${tripId}`)}
        backText={tItinerary('backToTrip')}
      />
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-4 px-4 sm:px-6">
      {/* 頁首由行程空間殼提供（分頁列已標示所在位置），此列只放動作 */}
      <div className="mb-4 flex items-center justify-between gap-2">
        {/* 閱讀/編輯切換：僅 admin；非 admin 恆為閱讀模式 */}
        {isAdmin ? (
          <Tabs value={pageMode} onValueChange={(v) => setPageMode(v as 'read' | 'edit')}>
            <TabsList className="grid w-[180px] grid-cols-2">
              <TabsTrigger value="read" className="gap-1.5">
                <Eye size={14} />
                {tItinerary('readMode')}
              </TabsTrigger>
              <TabsTrigger value="edit" className="gap-1.5">
                <Pencil size={14} />
                {tItinerary('editMode')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <ExportMenu
            build={buildExport}
            fileBaseName={`${trip?.name ?? 'trip'}-${tExport('itinerary.heading')}`}
            disabled={days.length === 0}
          />
          {editable && (
            <Button onClick={handleAddDay} className="gap-2">
              <Plus className="h-4 w-4" />
              {tItinerary('addDay')}
            </Button>
          )}
        </div>
      </div>

      {/* Day cards */}
      {days.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={tItinerary('emptyState')}
          description={tItinerary('emptyStateHint')}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <ItineraryDayCard
              key={day.id}
              day={day}
              tripId={tripId}
              editable={editable}
              onEdit={handleEditDay}
              onAddActivity={handleAddActivity}
              onDelete={handleDeleteDay}
              onEditActivity={handleEditActivity}
              onDeleteActivity={handleDeleteActivity}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <ItineraryDayDialog
        mode={dialogMode}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleDialogSubmit}
        tripId={tripId}
        day={editingDay}
        dayNumber={dialogMode === 'edit' ? editingDay?.day_number : days.length + 1}
      />

      {/* 卡片捷徑：手機友善的單一活動新增/編輯（不開整天編輯） */}
      <ActivityFormDialog
        open={!!activityDialog}
        onClose={() => setActivityDialog(null)}
        onSubmit={handleActivitySubmit}
        tripId={tripId}
        dayNumber={activityDialog?.day.day_number}
        activity={activityDialog?.activity ?? null}
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
