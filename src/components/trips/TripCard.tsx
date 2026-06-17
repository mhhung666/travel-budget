'use client';

import { Copy, Users, CalendarRange, MapPin, Archive, ArchiveRestore } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { TripWithMembers } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, pickLocalizedName } from '@/lib/utils';
import { getLocalizedCountryName } from '@/constants/countries';

export interface TripCardProps {
  trip: TripWithMembers;
  onClick: () => void;
  onCopyCode: (code: string) => void;
  /** Toggle this trip's archived state (per-member). Omit to hide the control. */
  onToggleArchive?: (trip: TripWithMembers) => void;
}

export default function TripCard({ trip, onClick, onCopyCode, onToggleArchive }: TripCardProps) {
  const t = useTranslations('trips');
  const locale = useLocale();
  const isArchived = trip.archived_at != null;

  const handleCopyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyCode(trip.hash_code);
  };

  const handleArchiveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleArchive?.(trip);
  };

  return (
    <Card
      onClick={onClick}
      className={cn(
        'relative h-full cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-border/50 bg-card',
        isArchived && 'opacity-70 hover:opacity-100'
      )}
    >
      {onToggleArchive && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={handleArchiveClick}
          aria-label={isArchived ? t('unarchive') : t('archive')}
          title={isArchived ? t('unarchive') : t('archive')}
        >
          {isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
        </Button>
      )}

      <CardContent className="p-6 flex flex-col h-full items-start text-left">
        <h3 className="text-xl font-semibold mb-2 text-foreground line-clamp-1 pr-8">
          {trip.name}
        </h3>

        {trip.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{trip.description}</p>
        )}

        <div className="mt-auto space-y-2 w-full">
          {/* Location */}
          {trip.location && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin size={14} className="text-muted-foreground" />
              <span className="truncate">
                {pickLocalizedName(trip.location.names, locale, trip.location.name)}
                {trip.location.country &&
                  `, ${getLocalizedCountryName(trip.location.country_code, locale, trip.location.country)}`}
              </span>
            </div>
          )}

          {/* Dates */}
          {(trip.start_date || trip.end_date) && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarRange size={14} className="text-muted-foreground" />
              <span>
                {trip.start_date
                  ? new Date(trip.start_date).toLocaleDateString(
                      locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : 'en-US'
                    )
                  : ''}
                {trip.start_date && trip.end_date && ' ~ '}
                {trip.end_date
                  ? new Date(trip.end_date).toLocaleDateString(
                      locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : 'en-US'
                    )
                  : ''}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 mt-4 pt-2 w-full">
            <Badge variant="outline" className="flex items-center gap-1 font-normal">
              <Users size={12} />
              {trip.member_count} {t('members')}
            </Badge>

            <Badge
              variant="secondary"
              className="flex items-center gap-1 cursor-pointer hover:bg-secondary/80 font-normal"
              onClick={handleCopyClick}
            >
              <Copy size={12} />
              {t('idLabel')} {trip.hash_code}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
