'use client';

import { MapPin } from 'lucide-react';
import { useLocale } from 'next-intl';
import type { Location } from '@/types';
import { cn, pickLocalizedName } from '@/lib/utils';

interface TripDestinationProps {
  destination?: Location | null;
  iconSize?: number;
  className?: string;
  truncate?: boolean;
}

/** 顯示旅行的主要目的地；實際交通航段由 FlightRecord 顯示。 */
export default function TripDestination({
  destination,
  iconSize = 14,
  className,
  truncate,
}: TripDestinationProps) {
  const locale = useLocale();
  if (!destination) return null;

  return (
    <div className={cn('flex items-center gap-1.5 text-sm text-muted-foreground', className)}>
      <MapPin size={iconSize} className="shrink-0 text-muted-foreground" />
      <span className={cn(truncate && 'truncate')}>
        {pickLocalizedName(destination.names, locale, destination.name)}
      </span>
    </div>
  );
}
