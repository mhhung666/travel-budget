'use client';

import { Edit2, Trash2, MapPin } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { ItineraryDay } from '@/types';
import { pickLocalizedName } from '@/lib/utils';
import { countryCodeToFlag } from '@/components/map/country';
import MarkdownRenderer from './MarkdownRenderer';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ItineraryDayCardProps {
  day: ItineraryDay;
  isAdmin: boolean;
  onEdit: (day: ItineraryDay) => void;
  onDelete: (dayId: string) => void;
}

export default function ItineraryDayCard({
  day,
  isAdmin,
  onEdit,
  onDelete,
}: ItineraryDayCardProps) {
  const tItinerary = useTranslations('itinerary');
  const locale = useLocale();

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
      </CardContent>
    </Card>
  );
}
