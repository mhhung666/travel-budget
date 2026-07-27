'use client';

import { ReactNode, useState } from 'react';
import { ChevronDown, Edit2, CalendarRange } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Trip } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import TripRoute from '@/components/trips/TripRoute';
import { cn } from '@/lib/utils';

interface TripHeaderProps {
  trip: Trip;
  isCurrentUserAdmin: boolean;
  onEdit: () => void;
  children?: ReactNode;
}

export default function TripHeader({
  trip,
  isCurrentUserAdmin,
  onEdit,
  children,
}: TripHeaderProps) {
  const tTrip = useTranslations('trip');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const dateLocale = locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale;

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">{tTrip('info')}</h2>
              <TripRoute
                departure={trip.departure_location}
                destination={trip.destination_location}
                iconSize={16}
                className="gap-2"
              />

              {(trip.start_date || trip.end_date) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarRange size={16} />
                  <span>
                    {trip.start_date
                      ? new Date(trip.start_date).toLocaleDateString(dateLocale)
                      : ''}
                    {trip.start_date && trip.end_date && ' – '}
                    {trip.end_date ? new Date(trip.end_date).toLocaleDateString(dateLocale) : ''}
                  </span>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {isCurrentUserAdmin && (
                <Button size="icon" variant="ghost" onClick={onEdit} aria-label={tCommon('edit')}>
                  <Edit2 size={16} />
                </Button>
              )}
              {(trip.description || children) && (
                <CollapsibleTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={open ? tCommon('hideDetails') : tCommon('moreDetails')}
                  >
                    <ChevronDown
                      size={18}
                      className={cn('transition-transform', open && 'rotate-180')}
                    />
                  </Button>
                </CollapsibleTrigger>
              )}
            </div>
          </div>

          <CollapsibleContent>
            {trip.description && (
              <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">{trip.description}</p>
            )}
            {children && (
              <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
                {children}
              </div>
            )}
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}
