'use client';

import { Edit2, Trash2, MapPin, Ticket, CalendarPlus, Medal } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { Activity, ItineraryDay, TripPhoto } from '@/types';
import { pickLocalizedName, cn } from '@/lib/utils';
import { activityImportKind } from '@/lib/collectionImport';
import { countryCodeToFlag } from '@/components/map/country';
import { sortActivities } from '@/lib/itineraryActivities';
import { ACTIVITY_TYPE_ICON } from './activityMeta';
import MarkdownRenderer from './MarkdownRenderer';
import { TicketThumb } from '@/components/trips/detail/ReceiptAttachments';
import { DayPhotoStrip } from '@/components/trips/detail/album';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ItineraryDayCardProps {
  day: ItineraryDay;
  /** 票券附件檢視需要 trip 識別碼。 */
  tripId: string;
  isAdmin: boolean;
  onEdit: (day: ItineraryDay) => void;
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
  const tItinerary = useTranslations('itinerary');
  const tAct = useTranslations('itinerary.activities');
  const locale = useLocale();

  const activities = sortActivities(day.activities);

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
        <div className="flex justify-between items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Badge variant="default" className="text-sm font-semibold h-7 px-3 shrink-0">
              Day {day.day_number}
            </Badge>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold leading-none tracking-tight">
                {day.title}
              </h3>
              {day.location && (
                <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {countryCodeToFlag(day.location.country_code)}{' '}
                    {pickLocalizedName(day.location.names, locale, day.location.name)}
                  </span>
                </span>
              )}
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onAddActivity(day)}
                title={tAct('add')}
              >
                <CalendarPlus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(day)}
                title={tItinerary('editDay')}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(day.id)}
                title={tItinerary('deleteDay')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="mt-2 text-sm text-foreground/90">
          {day.content ? (
            <MarkdownRenderer content={day.content} />
          ) : (
            <p className="text-muted-foreground italic">{tItinerary('dayContentPlaceholder')}</p>
          )}
        </div>

        {activities.length > 0 && (
          <div className="mt-4 flex flex-col gap-2.5 border-t pt-4">
            {activities.map((activity) => {
              const Icon = ACTIVITY_TYPE_ICON[activity.type] ?? MapPin;
              return (
                <div key={activity.id} className="flex items-start gap-3">
                  <div className="flex w-11 shrink-0 flex-col items-end pt-1 text-xs font-medium leading-tight tabular-nums text-muted-foreground">
                    {activity.time && <span>{activity.time}</span>}
                    {activity.end_time && (
                      <span className="text-muted-foreground/70">{activity.end_time}</span>
                    )}
                  </div>
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{activity.title}</span>
                    {activity.location && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {countryCodeToFlag(activity.location.country_code)}{' '}
                          {pickLocalizedName(
                            activity.location.names,
                            locale,
                            activity.location.name
                          )}
                        </span>
                      </span>
                    )}
                    {activity.note && (
                      <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                        {activity.note}
                      </p>
                    )}
                    {activity.confirmation_code && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        <Ticket className="h-3 w-3 shrink-0" />
                        <span className="font-mono">{activity.confirmation_code}</span>
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
                  <div className="flex shrink-0 gap-0.5">
                    {activityImportKind(activity.type) !== null &&
                      (importedActivityIds.has(activity.id) ? (
                        <span
                          className="flex h-7 w-7 items-center justify-center text-primary"
                          title={tAct('imported')}
                        >
                          <Medal className="h-3.5 w-3.5" />
                          <span className="sr-only">{tAct('imported')}</span>
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn('h-7 w-7 text-muted-foreground hover:text-primary')}
                          onClick={() => onImportActivity(day, activity)}
                          title={tAct('importToCollections')}
                        >
                          <Medal className="h-3.5 w-3.5" />
                        </Button>
                      ))}
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onEditActivity(day, activity)}
                        title={tAct('edit')}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => onDeleteActivity(day, activity)}
                        title={tAct('remove')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 當天相片（相簿裡關聯到這天的相片；沒有就整段不顯示） */}
        <DayPhotoStrip photos={photos} onSelect={onSelectPhoto} />
      </CardContent>
    </Card>
  );
}
