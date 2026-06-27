'use client';

import { Edit2, Trash2, MapPin, Ticket } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { ItineraryDay } from '@/types';
import { pickLocalizedName } from '@/lib/utils';
import { countryCodeToFlag } from '@/components/map/country';
import { sortActivities } from '@/lib/itineraryActivities';
import { ACTIVITY_TYPE_ICON } from './activityMeta';
import MarkdownRenderer from './MarkdownRenderer';
import { TicketThumb } from '@/components/trips/detail/ReceiptAttachments';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ItineraryDayCardProps {
  day: ItineraryDay;
  /** 票券附件檢視需要 trip 識別碼。 */
  tripId: string;
  isAdmin: boolean;
  onEdit: (day: ItineraryDay) => void;
  onDelete: (dayId: string) => void;
}

export default function ItineraryDayCard({
  day,
  tripId,
  isAdmin,
  onEdit,
  onDelete,
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
              <h3 className="truncate text-xl font-semibold leading-none tracking-tight">
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
                  <span className="w-11 shrink-0 pt-1 text-right text-xs font-medium tabular-nums text-muted-foreground">
                    {activity.time ?? ''}
                  </span>
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium text-foreground">{activity.title}</span>
                      {activity.end_time && (
                        <span className="text-xs text-muted-foreground">
                          {activity.time ? '– ' : ''}
                          {activity.end_time}
                        </span>
                      )}
                    </div>
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
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
