'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { CalendarDays, Plus } from 'lucide-react';
import {
  ItineraryDayCard,
  ItineraryDayDialog,
  ActivityFormDialog,
} from '@/components/trips/detail/itinerary';
import {
  dayActivitiesToDrafts,
  draftsToPayload,
} from '@/components/trips/detail/itinerary/ActivityListEditor';
import { PhotoLightbox } from '@/components/trips/detail/album';
import type { LocationOption } from '@/components/location/LocationAutocomplete';
import { ExportMenu } from '@/components/export';
import { FlightRecordDialog, StayRecordDialog } from '@/components/collections';
import type { Activity, ItineraryDay, TripPhoto } from '@/types';
import type { CreateFlightRecordInput, CreateStayRecordInput } from '@/lib/validation';
import {
  useItinerary,
  usePhotos,
  useTrip,
  useTripMembership,
  useItineraryMutations,
  useTripCollectionLinks,
} from '@/hooks/queries';
import type { ActivityPayload } from '@/hooks/queries/useItineraryMutations';
import { exportItinerary, type ExportFormat } from '@/lib/exporters';
import {
  activityImportKind,
  dayDateFromTrip,
  matchHotelBrand,
  parseAirports,
  parseFlightNo,
  parseNights,
} from '@/lib/collectionImport';

import { ItinerarySkeleton } from '@/components/skeletons';
import { EmptyState, ErrorState } from '@/components/common';
import { Button } from '@/components/ui/button';
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
  const { isAdmin, isMember } = useTripMembership(tripId);
  // 當天相片：與相簿頁共用同一份 query 快取（一趟旅程只查一次），在這裡依行程日分組。
  // 成員限定——usePhotos 無公開 fallback；非成員（含分享頁訪客）連問都不必問，故用 isMember 擋掉。
  const { data: photos = [] } = usePhotos(tripId, isMember);
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

  const photosByDay = useMemo(() => {
    const map = new Map<string, TripPhoto[]>();
    for (const photo of photos) {
      if (!photo.itinerary_day_id) continue;
      const list = map.get(photo.itinerary_day_id);
      if (list) list.push(photo);
      else map.set(photo.itinerary_day_id, [photo]);
    }
    return map;
  }, [photos]);

  // 放大檢視當天相片：唯讀（編輯／刪除留在相簿頁一處）。dayId 決定 lightbox 拿哪一組相片。
  const [viewingPhotos, setViewingPhotos] = useState<{ dayId: string; index: number } | null>(null);
  const viewingDayPhotos = viewingPhotos ? (photosByDay.get(viewingPhotos.dayId) ?? []) : [];

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
  // 待確認刪除的單筆活動；null＝關閉確認框。
  const [deletingActivity, setDeletingActivity] = useState<{
    day: ItineraryDay;
    activity: Activity;
  } | null>(null);
  // 「帶入旅行成就」對話框（交通→飛行 / 住宿→住宿，預填自活動）；null＝關閉。
  const [importing, setImporting] = useState<{
    kind: 'flight' | 'stay';
    flightDefaults?: Partial<CreateFlightRecordInput>;
    stayDefaults?: Partial<CreateStayRecordInput>;
  } | null>(null);

  // 我已帶入成就的活動 id（顯示已帶入、防重複）；頁面有交通/住宿活動才需要查。
  const hasImportable = days.some((d) =>
    d.activities.some((a) => activityImportKind(a.type) !== null)
  );
  const { data: links } = useTripCollectionLinks(tripId, hasImportable);
  // 帶入時鎖定的連結旅程＝當下旅程（用解析後的 ObjectId，避免與 hash_code 網址不一致）。
  const lockedTrip = useMemo(() => (trip ? { id: trip.id, name: trip.name } : null), [trip]);
  const importedActivityIds = new Set([
    ...(links?.flight_activity_ids ?? []),
    ...(links?.stay_activity_ids ?? []),
  ]);

  // 帶入＝開預填的補登對話框：日期由旅程出發日推第 N 天，其餘從活動文字啟發式帶出，
  // 猜錯在對話框裡改掉即可；trip 與來源活動 id 一併連結（後端驗證歸屬）。
  const handleImportActivity = (day: ItineraryDay, activity: Activity) => {
    const kind = activityImportKind(activity.type);
    if (!kind) return;
    const date = dayDateFromTrip(trip?.start_date, day.day_number);
    const base = {
      trip_id: tripId,
      source_activity_id: activity.id,
      ...(date ? { date, check_in: date } : {}),
    };
    if (kind === 'flight') {
      const text = `${activity.title} ${activity.note}`;
      const parsed = parseFlightNo(text);
      const airports = parseAirports(text);
      setImporting({
        kind,
        flightDefaults: {
          trip_id: base.trip_id,
          source_activity_id: base.source_activity_id,
          ...(date ? { date } : {}),
          ...(parsed ? { airline: parsed.airline, flight_no: parsed.flightNo } : {}),
          ...(airports ? { from_airport: airports.from, to_airport: airports.to } : {}),
        },
      });
    } else {
      const brand = matchHotelBrand(activity.title);
      const city = activity.location?.name ?? day.location?.name ?? '';
      const nights = parseNights(`${activity.title} ${activity.note}`);
      setImporting({
        kind,
        stayDefaults: {
          trip_id: base.trip_id,
          source_activity_id: base.source_activity_id,
          ...(date ? { check_in: date } : {}),
          hotel_name: activity.title,
          ...(brand ? { brand } : {}),
          ...(city ? { city } : {}),
          ...(nights ? { nights } : {}),
        },
      });
    }
  };

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

  // 活動列上的「刪除」：先開確認框避免誤按，確認後才真的移除。
  const handleDeleteActivity = (day: ItineraryDay, activity: Activity) => {
    setDeletingActivity({ day, activity });
  };

  const confirmDeleteActivity = async () => {
    if (!deletingActivity) return;
    const { day, activity } = deletingActivity;
    const remaining = draftsToPayload(
      dayActivitiesToDrafts(day.activities.filter((a) => a.id !== activity.id))
    );
    try {
      await update.mutateAsync({ dayId: day.id, data: { activities: remaining } });
      toast({ title: tAct('removedFromDay', { dayNumber: day.day_number }) });
      setDeletingActivity(null);
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
      <div className="mb-4 flex items-center justify-end gap-2">
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
              isAdmin={isAdmin}
              onEdit={handleEditDay}
              onAddActivity={handleAddActivity}
              onDelete={handleDeleteDay}
              onEditActivity={handleEditActivity}
              onDeleteActivity={handleDeleteActivity}
              onImportActivity={handleImportActivity}
              importedActivityIds={importedActivityIds}
              photos={photosByDay.get(day.id) ?? []}
              onSelectPhoto={(index) => setViewingPhotos({ dayId: day.id, index })}
            />
          ))}
        </div>
      )}

      {/* 當天相片的放大檢視（唯讀：編輯與刪除在相簿頁） */}
      <PhotoLightbox
        photos={viewingDayPhotos}
        index={viewingPhotos?.index ?? null}
        onIndexChange={(index) =>
          setViewingPhotos(index === null || !viewingPhotos ? null : { ...viewingPhotos, index })
        }
      />

      {/* Add/Edit Dialog */}
      <ItineraryDayDialog
        mode={dialogMode}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleDialogSubmit}
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

      {/* 交通/住宿活動「帶入旅行成就」：預填的補登對話框（個人紀錄，任何成員可用） */}
      <FlightRecordDialog
        open={importing?.kind === 'flight'}
        onOpenChange={(open) => !open && setImporting(null)}
        editing={null}
        defaults={importing?.flightDefaults ?? null}
        lockedTrip={lockedTrip}
        onSaved={() => toast({ title: tAct('importedSuccess') })}
      />
      <StayRecordDialog
        open={importing?.kind === 'stay'}
        onOpenChange={(open) => !open && setImporting(null)}
        editing={null}
        defaults={importing?.stayDefaults ?? null}
        lockedTrip={lockedTrip}
        onSaved={() => toast({ title: tAct('importedSuccess') })}
      />

      {/* 單筆活動刪除確認 */}
      <AlertDialog
        open={!!deletingActivity}
        onOpenChange={(open) => !open && setDeletingActivity(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tAct('removeConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingActivity &&
                tAct('removeConfirmMessage', {
                  title: deletingActivity.activity.title,
                  dayNumber: deletingActivity.day.day_number,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteActivity}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tCommon('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
