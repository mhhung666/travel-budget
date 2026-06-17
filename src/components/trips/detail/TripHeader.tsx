'use client';

import { ReactNode } from 'react';
import { Edit2, MapPin, CalendarRange } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Trip } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">{tTrip('info')}</h2>
            {trip.description && <p className="text-muted-foreground mb-4">{trip.description}</p>}

            {/* 地點顯示 */}
            {trip.location && (
              <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                <MapPin size={16} />
                <span>
                  {trip.location.name}
                  {trip.location.country && `, ${trip.location.country}`}
                </span>
              </div>
            )}

            {/* 日期顯示 */}
            {(trip.start_date || trip.end_date) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarRange size={16} />
                <span>
                  {trip.start_date ? new Date(trip.start_date).toLocaleDateString() : ''}
                  {trip.start_date && trip.end_date && ' ~ '}
                  {trip.end_date ? new Date(trip.end_date).toLocaleDateString() : ''}
                </span>
              </div>
            )}
          </div>

          {isCurrentUserAdmin && (
            <Button size="sm" variant="outline" onClick={onEdit} className="gap-2">
              <Edit2 size={16} />
              {tCommon('edit')}
            </Button>
          )}
        </div>

        {children && (
          <div className="mt-6 pt-6 border-t flex flex-col sm:flex-row gap-3">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}
