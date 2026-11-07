'use client';

import type { ItineraryContinuation } from '@travel-budget/contracts';
import { activityAnchorId } from '@/lib/itineraryContinuations';
import { ActivityContinuations } from './ActivityContinuations';
import { activityTimingLabels, activityTimingText } from '@/lib/activityTiming';
import { ActivityBatchBar, useActivityBatchSelection } from './ActivityBatchDeletion';
import {
  Edit2,
  Trash2,
  MapPin,
  Ticket,
  Plus,
  ChevronDown,
  NotebookPen,
  Medal,
  MoreHorizontal,
  ListChecks,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { Activity, ItineraryDay, TripPhoto } from '@/types';
import { pickLocalizedName } from '@/lib/utils';
import { activityImportKind } from '@/lib/collectionImport';
import { countryCodeToFlag } from '@/components/map/country';
import { sortActivities } from '@/lib/itineraryActivities';
import { ACTIVITY_TYPE_ICON } from './activityMeta';
import { ItineraryDayDate } from './ItineraryDayDate';
import MarkdownRenderer from './MarkdownRenderer';
import { TicketThumb } from '@/components/trips/detail/ReceiptAttachments';
import { DayPhotoStrip } from '@/components/trips/detail/album';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ItineraryDayCardProps {
  day: ItineraryDay;
  continuations?: readonly ItineraryContinuation[];
  /** 由旅程開始日與 day number 推算，不另外存入行程日。 */
  date?: string | null;
  outsideTripRange?: boolean;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  /** 票券附件檢視需要 trip 識別碼。 */
  tripId: string;
  isAdmin: boolean;
  onEdit: (day: ItineraryDay, focus?: 'notes') => void;
  /** 卡片上的「新增活動」捷徑：開輕量單一活動對話框。 */
  onAddActivity: (day: ItineraryDay) => void;
  onDelete: (dayId: string) => void;
  /** 活動列右側的編輯捷徑：開單一活動對話框（預填該筆）。 */
  onEditActivity: (day: ItineraryDay, activity: Activity) => void;
  onDeleteActivity: (day: ItineraryDay, activity: Activity) => void;
  /**
   * 交通/住宿活動「帶入旅行成就」（開預填的補登對話框）。個人紀錄——
   * 任何成員都可帶入自己的成就，不受 isAdmin 限制。
   */
  onImportActivity: (day: ItineraryDay, activity: Activity) => void;
  /** 我已帶入成就的活動 id 集合（顯示已帶入、防重複）。 */
  importedActivityIds: Set<string>;
  /** 關聯到這天的相簿相片（成員限定；非成員為空陣列 → 不顯示相片列）。 */
  photos: TripPhoto[];
  /** 點縮圖：回報在 `photos` 中的 index，由頁面開 lightbox。 */
  onSelectPhoto: (index: number) => void;
}

export default function ItineraryDayCard({
  day,
  continuations = [],
  date,
  outsideTripRange,
  tripStartDate,
  tripEndDate,
  tripId,
  isAdmin,
  onEdit,
  onAddActivity,
  onDelete,
  onEditActivity,
  onDeleteActivity,
  onImportActivity,
  importedActivityIds,
  photos,
  onSelectPhoto,
}: ItineraryDayCardProps) {
  const tTime = useTranslations('itinerary.timing');
  const timingLabels = activityTimingLabels(tTime);
  const tItinerary = useTranslations('itinerary');
  const tAct = useTranslations('itinerary.activities');
  const locale = useLocale();
  const tBatch = useTranslations('itinerary.batch');
  const batch = useActivityBatchSelection();
  const selecting = batch?.dayId === day.id;

  const activities = sortActivities(day.activities);

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="flex min-w-0 flex-wrap items-start gap-3">
            <Badge variant="default" className="text-sm font-semibold h-7 px-3 shrink-0">
              Day {day.day_number}
            </Badge>
            <div className="min-w-0 flex-1 basis-32">
              <h3
                id={`batch-day-${day.id}`}
                tabIndex={-1}
                className="[overflow-wrap:anywhere] text-lg font-semibold leading-snug tracking-tight outline-none"
              >
                {day.title}
              </h3>
              <ItineraryDayDate
                date={date}
                outsideTripRange={outsideTripRange}
                className="mt-1.5"
              />
              {day.location && (
                <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 break-words">
                    {countryCodeToFlag(day.location.country_code)}{' '}
                    {pickLocalizedName(day.location.names, locale, day.location.name)}
                  </span>
                </span>
              )}
            </div>
          </div>
          {isAdmin && !selecting && (
            <div className="min-w-0 max-w-36 justify-self-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-auto min-h-11 max-w-full gap-2 whitespace-normal rounded-lg px-3 py-2"
                    title={tItinerary('dayActions')}
                    aria-label={tItinerary('dayActions')}
                  >
                    {tItinerary('dayActions')}
                    <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
                  <DropdownMenuItem
                    className="min-h-11 whitespace-normal"
                    onClick={() => onEdit(day)}
                  >
                    <Edit2 className="mr-2 h-4 w-4" />
                    {tItinerary('editDay')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(day.id)}
                    className="min-h-11 whitespace-normal text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {tItinerary('deleteDay')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pt-0">
        {day.content ? (
          <div className="mt-2 min-w-0 text-sm text-foreground/90 [overflow-wrap:anywhere]">
            <MarkdownRenderer content={day.content} />
          </div>
        ) : isAdmin && !selecting ? (
          <Button
            variant="ghost"
            className="h-auto min-h-11 max-w-full gap-2 whitespace-normal px-2 py-2 text-muted-foreground"
            onClick={() => onEdit(day, 'notes')}
          >
            <NotebookPen className="h-4 w-4 shrink-0" aria-hidden="true" />
            {tItinerary('addDayNotes')}
          </Button>
        ) : null}

        <ActivityContinuations hints={continuations} />
        <div className="mt-4 flex flex-col border-t pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h4 className="flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground">
              {tAct('heading')}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
                {activities.length}
              </span>
            </h4>
            {isAdmin && !selecting && (
              <div className="ml-auto flex max-w-full flex-wrap gap-2">
                {batch && activities.length > 0 && (
                  <Button
                    id={`batch-start-${day.id}`}
                    variant="outline"
                    className="h-auto min-h-11 max-w-full gap-2 rounded-lg bg-transparent px-3 py-2 text-muted-foreground shadow-none whitespace-normal hover:text-foreground"
                    disabled={!batch.online || batch.busy || batch.pending}
                    aria-describedby={!batch.online ? `batch-offline-${day.id}` : undefined}
                    onClick={() => batch.start(day)}
                  >
                    <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {tBatch('start')}
                  </Button>
                )}
                <Button
                  className="h-auto min-h-11 max-w-full gap-2 whitespace-normal rounded-lg px-3 py-2"
                  onClick={() => onAddActivity(day)}
                >
                  <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {tAct('add')}
                </Button>
              </div>
            )}
          </div>
          {isAdmin && batch && activities.length > 0 && !selecting && !batch.online && (
            <p id={`batch-offline-${day.id}`} className="mb-2 text-sm text-muted-foreground">
              {tBatch('onlineOnly')}
            </p>
          )}
          {activities.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">{tAct('empty')}</p>
          )}
          {activities.map((activity) => {
            const timing = activityTimingText(activity, day.day_number, date, timingLabels);
            if (selecting && batch)
              return (
                <label
                  key={activity.id}
                  className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-3 ${batch.selected.has(activity.id) ? 'bg-primary/10' : 'hover:bg-muted'}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-primary"
                    checked={batch.selected.has(activity.id)}
                    disabled={
                      batch.busy ||
                      batch.pending ||
                      (!batch.selected.has(activity.id) && batch.selected.size >= 15)
                    }
                    onChange={() => batch.toggle(activity)}
                    aria-label={`Day ${day.day_number} · ${date ?? tBatch('undated')} · ${timing.summary} · ${activity.title}`}
                  />
                  <span className="min-w-0 break-words">
                    <span className="mr-2 tabular-nums text-muted-foreground">
                      {timing.summary}
                    </span>
                    <span className="font-medium">{activity.title}</span>
                    {timing.showSummary && (
                      <p className="mt-1 text-xs text-muted-foreground">{timing.summary}</p>
                    )}
                    {timing.endDate &&
                      ((tripStartDate && timing.endDate < tripStartDate) ||
                        (tripEndDate && timing.endDate > tripEndDate)) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tTime('outsideRange')}
                        </p>
                      )}
                    {(activity.location || activity.location_name) && (
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {activity.location
                          ? pickLocalizedName(
                              activity.location.names,
                              locale,
                              activity.location.name
                            )
                          : activity.location_name}
                      </span>
                    )}
                  </span>
                </label>
              );
            const hasClock = !!(timing.compactStart || timing.compactEnd);
            const Icon = ACTIVITY_TYPE_ICON[activity.type] ?? MapPin;
            // 帶入旅行成就是個人紀錄，任何成員都能用；已帶入的只顯示獎章。
            const canImport =
              activityImportKind(activity.type) !== null && !importedActivityIds.has(activity.id);
            return (
              <div
                key={activity.id}
                id={activityAnchorId(day.id, activity.id)}
                tabIndex={-1}
                role="group"
                aria-label={`${timing.summary} · ${activity.title}`}
                className={`outline-none focus:ring-2 focus:ring-primary scroll-mt-[calc(var(--trip-space-header-height,0px)+5rem)] md:scroll-mt-[calc(var(--trip-space-header-height,0px)+9rem)] grid items-start gap-x-2 gap-y-1 border-b border-border/50 py-3 last:border-b-0 sm:gap-x-3 ${hasClock ? 'grid-cols-[max-content_minmax(0,1fr)_auto] sm:grid-cols-[max-content_1.75rem_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[1.75rem_minmax(0,1fr)_auto]'}`}
              >
                {hasClock && (
                  <div
                    data-activity-clock
                    className="flex min-w-0 shrink-0 flex-col items-end gap-1 pt-1 text-xs font-medium leading-tight tabular-nums text-muted-foreground"
                  >
                    {timing.compactStart && (
                      <span className="whitespace-nowrap">{timing.compactStart}</span>
                    )}
                    {timing.compactEnd && (
                      <span className="whitespace-nowrap text-muted-foreground/70">
                        {timing.compactEnd}
                      </span>
                    )}
                  </div>
                )}
                <span className="mt-0.5 hidden h-7 w-7 sm:flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-medium text-foreground">
                    <Icon
                      className="mr-1 inline-block h-4 w-4 align-text-bottom text-muted-foreground sm:hidden"
                      aria-hidden="true"
                    />
                    {activity.title}
                  </span>
                  {timing.warning && (
                    <p className="mt-1 text-xs text-muted-foreground">{tTime('unconfirmed')}</p>
                  )}
                  {timing.endDate &&
                    ((tripStartDate && timing.endDate < tripStartDate) ||
                      (tripEndDate && timing.endDate > tripEndDate)) && (
                      <p className="mt-1 text-xs text-muted-foreground">{tTime('outsideRange')}</p>
                    )}
                  {(activity.location || activity.location_name) && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="min-w-0 break-words">
                        {activity.location
                          ? `${countryCodeToFlag(activity.location.country_code)} ${pickLocalizedName(
                              activity.location.names,
                              locale,
                              activity.location.name
                            )}`.trim()
                          : activity.location_name}
                      </span>
                    </span>
                  )}
                  {activity.note && (
                    <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                      {activity.note}
                    </p>
                  )}
                  {activity.confirmation_code && (
                    <span className="mt-1 inline-flex max-w-full items-start gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      <Ticket className="h-3 w-3 shrink-0" />
                      <span className="min-w-0 font-mono [overflow-wrap:anywhere]">
                        {activity.confirmation_code}
                      </span>
                      <span className="sr-only">{tAct('confirmationCode')}</span>
                    </span>
                  )}
                  {activity.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {activity.attachments.map((att) => (
                        <TicketThumb key={att.key} tripId={tripId} attachment={att} />
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className={`row-start-1 flex flex-col items-center gap-1 ${hasClock ? 'col-start-3 sm:col-start-4' : 'col-start-2 sm:col-start-3'}`}
                >
                  {importedActivityIds.has(activity.id) && (
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center text-primary"
                      title={tAct('imported')}
                    >
                      <Medal className="h-3.5 w-3.5" />
                      <span className="sr-only">{tAct('imported')}</span>
                    </span>
                  )}
                  {(isAdmin || canImport) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 shrink-0 text-muted-foreground"
                          title={tAct('moreActions')}
                          aria-label={`${tAct('moreActions')} · ${timing.summary} · ${activity.title}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="max-w-[calc(100vw-2rem)] [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:whitespace-normal"
                      >
                        <DropdownMenuLabel className="max-w-72 whitespace-normal [overflow-wrap:anywhere]">
                          {activity.title}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {canImport && (
                          <DropdownMenuItem onClick={() => onImportActivity(day, activity)}>
                            <Medal className="mr-2 h-4 w-4" />
                            {tAct('importToCollections')}
                          </DropdownMenuItem>
                        )}
                        {isAdmin && (
                          <>
                            <DropdownMenuItem onClick={() => onEditActivity(day, activity)}>
                              <Edit2 className="mr-2 h-4 w-4" />
                              {tAct('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onDeleteActivity(day, activity)}
                              className="min-h-11 whitespace-normal text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {tAct('remove')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <ActivityBatchBar day={day} />
        {/* 當天相片（相簿裡關聯到這天的相片；沒有就整段不顯示） */}
        <DayPhotoStrip photos={photos} onSelect={onSelectPhoto} />
      </CardContent>
    </Card>
  );
}
