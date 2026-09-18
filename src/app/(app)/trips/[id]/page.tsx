'use client';
import dynamic from 'next/dynamic';
import { ClientQueryBoundary } from '@/components/common/ClientQueryBoundary';
import { QueryStatus } from '@/components/common/QueryStatus';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, Sparkles } from 'lucide-react';
import {
  ItineraryDayCard,
  ItineraryDayNav,
  itineraryDayAnchorId,
} from '@/components/trips/detail/itinerary';
import { PhotoLightbox } from '@/components/trips/detail/album';
import { QueryFeedback } from '@/components/common/QueryFeedback';
import TripContextOverview from '@/components/trips/detail/TripContextOverview';
import {
  EditTripDialog,
  ItineraryDayDialog,
  ActivityFormDialog,
  ItineraryImportDialog,
} from '@/components/trips/DeferredDialogs';
import { useTripSpaceActions } from '@/components/trips/space/TripSpaceContext';
import type { LocationOption } from '@/components/location/LocationAutocomplete';
import { ExportMenu } from '@/components/export';
import { FlightRecordDialog, StayRecordDialog } from '@/components/collections/DeferredDialogs';
import type { Activity, ItineraryDay, TripPhoto } from '@/types';
import type {
  CreateFlightRecordInput,
  CreateStayRecordInput,
  ItineraryDayTargetInput,
} from '@/lib/validation';
import {
  useItinerary,
  usePhotos,
  useTrip,
  useTripShell,
  useItineraryMutations,
  useTripCollectionLinks,
  useChecklists,
  useSettlement,
} from '@/hooks/queries';
import type { ActivityPayload } from '@/hooks/queries/useItineraryMutations';
import { tripKeys } from '@/hooks/queries/keys';
import { useEditTrip } from '@/hooks/useEditTrip';
import { exportItinerary, type ExportFormat } from '@/lib/exporters';
import {
  activityImportKind,
  dayDateFromTrip,
  isTripDayOutsideRange,
  matchHotelBrand,
  parseAirports,
  parseFlightNo,
  parseNights,
} from '@/lib/collectionImport';
import { getTripPhase, ongoingDayNumber } from '@/lib/tripStatus';
import { tripDateList } from '@/lib/itineraryDayTarget';
import { intlLocale } from '@/lib/relativeTime';

import { ItinerarySkeleton } from '@/components/skeletons';
import { EmptyState } from '@/components/common';
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

const ItineraryPdfExportDialog = dynamic(
  () => import('@/components/export/ItineraryPdfExportDialog'),
  { ssr: false }
);

/**
 * 行程空間的「行程」分頁，同時是空間落點（trips/[id]）：行程資訊卡 + 每日行程卡。
 * 隨手記／清單為本分頁的子分頁（見 TripSpaceShell 的子分頁列）。
 */
export default function ItineraryPage() {
  return (
    <ClientQueryBoundary fallback={<ItinerarySkeleton />}>
      <ItineraryPageContent />
    </ClientQueryBoundary>
  );
}

function ItineraryPageContent() {
  const [pdfOpen, setPdfOpen] = useState(false);
  const params = useParams();
  const tripId = params.id as string;
  const tItinerary = useTranslations('itinerary');
  const tAct = useTranslations('itinerary.activities');
  const locale = useLocale();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const itineraryQuery = useItinerary(tripId);
  const { data: days = [], isLoading: loading, refetch: refetchItinerary } = itineraryQuery;
  const tripQuery = useTrip(tripId);
  const { data: trip } = tripQuery;
  const { data: shell } = useTripShell(tripId);
  const phase = trip ? getTripPhase(trip.start_date, trip.end_date).phase : null;
  // Secondary overview data is phase-specific and does not block itinerary content.
  const checklistQuery = useChecklists(tripId, phase === 'preTrip');
  const { data: checklists } = checklistQuery;
  const settlementQuery = useSettlement(tripId, phase === 'postTrip');
  const { data: settlement } = settlementQuery;
  const isAdmin = shell?.role === 'admin';
  const isMember = shell?.role != null;
  const { openAddExpense } = useTripSpaceActions();
  // 當天相片：與相簿頁共用同一份 query 快取（一趟旅程只查一次），在這裡依行程日分組。
  // 成員限定——usePhotos 無公開 fallback；非成員（含分享頁訪客）連問都不必問，故用 isMember 擋掉。
  const photosQuery = usePhotos(tripId, isMember);
  const { data: photos = [] } = photosQuery;
  const { create, update, remove, mutateActivity } = useItineraryMutations(tripId);
  // 行程資訊卡（原在支出分頁）：行程分頁成為空間落點後改掛這裡
  const { editTripDialog, handleEditTrip } = useEditTrip(tripId);
  const tExport = useTranslations('export');

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
        flight: tAct('types.flight'),
        ground_transport: tAct('types.ground_transport'),
        transport: tAct('types.transport'),
        accommodation: tAct('types.accommodation'),
        shopping: tAct('types.shopping'),
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
  const [aiImportOpen, setAiImportOpen] = useState(false);
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
  const linksQuery = useTripCollectionLinks(tripId, isMember && hasImportable);
  const { data: links } = linksQuery;
  // 帶入時鎖定的連結旅程＝當下旅程（用解析後的 ObjectId，避免與 hash_code 網址不一致）。
  const lockedTrip = useMemo(() => (trip ? { id: trip.id, name: trip.name } : null), [trip]);
  const importedActivityIds = new Set([
    ...(links?.flight_activity_ids ?? []),
    ...(links?.stay_activity_ids ?? []),
  ]);
  const activeDayNumber = trip ? ongoingDayNumber(trip.start_date, trip.end_date) : null;
  const datesByDayId = useMemo(
    () => new Map(days.map((day) => [day.id, dayDateFromTrip(trip?.start_date, day.day_number)])),
    [days, trip?.start_date]
  );
  const dialogDayNumber = dialogMode === 'edit' ? (editingDay?.day_number ?? 0) : 0;
  const dialogDayDate = dayDateFromTrip(trip?.start_date, dialogDayNumber);
  const usedDayNumbers = useMemo(() => days.map((day) => day.day_number), [days]);
  // 旅程範圍內是否還有可新增的日期；全滿時入口改成「查看行程日期」。
  const allDatesCreated = useMemo(() => {
    const dates = tripDateList(trip?.start_date, trip?.end_date);
    if (dates.length === 0) return false;
    const used = new Set(usedDayNumbers);
    return dates.every((_, index) => used.has(index + 1));
  }, [trip?.start_date, trip?.end_date, usedDayNumbers]);

  // 帶入＝開預填的補登對話框：日期由旅程出發日推第 N 天，其餘從活動文字啟發式帶出，
  // 猜錯在對話框裡改掉即可；trip 與來源活動 id 一併連結（後端驗證歸屬）。
  const handleImportActivity = (day: ItineraryDay, activity: Activity) => {
    if (!linksQuery.data || linksQuery.isError) return;
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

  /**
   * 捲到某一天的卡片並把焦點放上去。錨點自身帶 `scroll-mt-*`（含 sticky 頁首高度），
   * 所以用 scrollIntoView 即可，不必重算 offset；並尊重「減少動態效果」。
   */
  const [pendingFocusDay, setPendingFocusDay] = useState<number | null>(null);
  const focusDayCard = useCallback((dayNumber: number) => {
    const el = document.getElementById(itineraryDayAnchorId(dayNumber));
    if (!el) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }, []);

  // 等待刷新後的卡片掛載且對話框關閉，避免網路較慢時遺失定位。
  useEffect(() => {
    if (
      pendingFocusDay === null ||
      dialogOpen ||
      !days.some((day) => day.day_number === pendingFocusDay)
    )
      return;
    const frame = requestAnimationFrame(() => {
      focusDayCard(pendingFocusDay);
      setPendingFocusDay(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingFocusDay, dialogOpen, days, focusDayCard]);

  // 從新增表單跳去看已建立的那天；有草稿時先確認，避免默默丟掉未儲存內容。
  const handleViewExistingDay = (dayNumber: number) => {
    setDialogOpen(false);
    requestAnimationFrame(() => focusDayCard(dayNumber));
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

  // 單筆活動寫入；保留開啟表單時的活動 snapshot，避免舊草稿覆蓋。
  const handleActivitySubmit = async (payload: ActivityPayload) => {
    if (!activityDialog) return;
    const { day, activity } = activityDialog;
    await mutateActivity.mutateAsync({
      dayId: day.id,
      data: activity
        ? {
            operation: 'update',
            activity_id: activity.id,
            activity: payload,
            expected_activity_revision: activity.revision,
          }
        : { operation: 'add', activity: payload },
    });
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
    try {
      await mutateActivity.mutateAsync({
        dayId: day.id,
        data: {
          operation: 'delete',
          activity_id: activity.id,
          expected_activity_revision: activity.revision,
        },
      });
      toast({ title: tAct('removedFromDay', { dayNumber: day.day_number }) });
      setDeletingActivity(null);
    } catch {
      // The mutation reports the translated error; keep the original snapshot.
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
    target?: ItineraryDayTargetInput;
  }) => {
    if (dialogMode === 'add') {
      // 真正的 dayNumber 由 server 依日期算出，不用清單長度推算。
      const created = await create.mutateAsync(data);
      const createdDate = dayDateFromTrip(trip?.start_date, created.day_number);
      toast({
        title: createdDate
          ? tItinerary('dayTarget.createdOn', {
              dayNumber: created.day_number,
              date: new Intl.DateTimeFormat(intlLocale(locale), {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              }).format(new Date(`${createdDate}T00:00:00Z`)),
            })
          : tItinerary('success.created', { dayNumber: created.day_number }),
      });
      setPendingFocusDay(created.day_number);
    } else if (editingDay) {
      await update.mutateAsync({
        dayId: editingDay.id,
        data: { ...data, expected_revision: editingDay.revision },
      });
      toast({
        title: tItinerary('success.updated', { dayNumber: editingDay.day_number }),
      });
    }
  };

  if (loading || (tripQuery.isLoading && tripQuery.data === undefined)) {
    return <ItinerarySkeleton />;
  }

  if (itineraryQuery.data === undefined) return <QueryStatus query={itineraryQuery} />;

  return (
    <div className="container mx-auto max-w-4xl py-4 px-4 sm:px-6">
      <QueryStatus query={tripQuery} />
      {phase === 'preTrip' && <QueryStatus query={checklistQuery} />}
      {phase === 'postTrip' && <QueryStatus query={settlementQuery} />}
      <QueryStatus query={itineraryQuery} />
      {isMember && hasImportable && <QueryStatus query={linksQuery} />}
      {isMember && (
        <QueryFeedback
          hasData={photosQuery.data !== undefined}
          isError={photosQuery.isError}
          isFetching={photosQuery.isFetching}
          isPaused={photosQuery.isPaused}
          onRetry={() => void photosQuery.refetch()}
        />
      )}
      {trip && (
        <TripContextOverview
          trip={trip}
          days={days}
          todaySpent={shell?.today_spent ?? 0}
          checklists={checklists}
          settlement={settlement}
          isMember={isMember}
          isAdmin={isAdmin}
          onEdit={editTripDialog.openDialog}
          onAddExpense={() => openAddExpense()}
        />
      )}

      {/* 頁首由行程空間殼提供（分頁列已標示所在位置），此列只放動作 */}
      <div className="mb-2 flex items-center justify-end gap-2">
        <ExportMenu
          onExportPdf={() => setPdfOpen(true)}
          build={buildExport}
          fileBaseName={`${trip?.name ?? 'trip'}-${tExport('itinerary.heading')}`}
          disabled={days.length === 0}
        />
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAiImportOpen(true)}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            {tItinerary('aiImport.action')}
          </Button>
        )}
        {/* 旅程內的日期都建立後就沒有可新增的目標，入口改成導向既有卡片。 */}
        {isAdmin &&
          days.length > 0 &&
          (allDatesCreated ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => focusDayCard(days[0].day_number)}
            >
              <CalendarDays className="h-4 w-4" />
              {tItinerary('dayTarget.viewDates')}
            </Button>
          ) : (
            <Button size="sm" onClick={handleAddDay} className="gap-2">
              <Plus className="h-4 w-4" />
              {tItinerary('addDay')}
            </Button>
          ))}
      </div>
      {isAdmin && days.length > 0 && allDatesCreated && (
        <p className="mb-2 text-right text-xs text-muted-foreground">
          {tItinerary('dayTarget.allDatesCreated')}
        </p>
      )}

      {pdfOpen && (
        <ItineraryPdfExportDialog
          key={`${tripId}-${isMember}`}
          startDate={trip?.start_date}
          tripId={tripId}
          days={days}
          isMember={isMember}
          onClose={() => setPdfOpen(false)}
        />
      )}

      {/* Day cards */}
      {days.length === 0 ? (
        /* 沒有新增權限時別叫使用者去按不存在的按鈕（docs/UX_IMPROVEMENTS.md 第 3 項） */
        <EmptyState
          icon={CalendarDays}
          title={tItinerary('emptyState')}
          description={tItinerary(isAdmin ? 'emptyStateHint' : 'emptyStateHintReadOnly')}
          action={
            isAdmin ? (
              <Button onClick={handleAddDay} className="gap-2">
                <Plus className="h-4 w-4" />
                {tItinerary('addDay')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {days.length > 1 && (
            <ItineraryDayNav
              days={days}
              datesByDayId={datesByDayId}
              todayDayNumber={activeDayNumber}
            />
          )}
          <div className="flex flex-col gap-6">
            {days.map((day) => {
              const date = datesByDayId.get(day.id) ?? null;
              return (
                <div
                  key={day.id}
                  id={itineraryDayAnchorId(day.day_number)}
                  tabIndex={-1}
                  className="outline-none scroll-mt-[calc(var(--trip-space-header-height,0px)+4rem)] md:scroll-mt-[calc(var(--trip-space-header-height,0px)+8rem)]"
                >
                  <ItineraryDayCard
                    day={day}
                    date={date}
                    outsideTripRange={isTripDayOutsideRange(date, trip?.end_date)}
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
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 當天相片的放大檢視（唯讀：編輯與刪除在相簿頁） */}
      <PhotoLightbox
        photos={viewingDayPhotos}
        index={viewingPhotos?.index ?? null}
        onIndexChange={(index) =>
          setViewingPhotos(index === null || !viewingPhotos ? null : { ...viewingPhotos, index })
        }
      />

      <EditTripDialog
        open={editTripDialog.open}
        onClose={editTripDialog.closeDialog}
        onSubmit={handleEditTrip}
        trip={trip ?? null}
      />

      <ItineraryImportDialog
        open={aiImportOpen}
        onClose={() => setAiImportOpen(false)}
        tripId={tripId}
        tripStartDate={trip?.start_date}
        tripEndDate={trip?.end_date}
        onImported={() => {
          void refetchItinerary();
          void queryClient.invalidateQueries({ queryKey: tripKeys.activity(tripId) });
        }}
      />

      {/* Add/Edit Dialog */}
      <ItineraryDayDialog
        mode={dialogMode}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleDialogSubmit}
        day={editingDay}
        dayNumber={dialogDayNumber || undefined}
        date={dialogDayDate}
        outsideTripRange={isTripDayOutsideRange(dialogDayDate, trip?.end_date)}
        tripStartDate={trip?.start_date}
        tripEndDate={trip?.end_date}
        usedDayNumbers={usedDayNumbers}
        onViewExistingDay={handleViewExistingDay}
        onOpenTripSettings={isAdmin ? editTripDialog.openDialog : undefined}
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
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteActivity();
              }}
              disabled={mutateActivity.isPending}
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
