'use client';

import { Copy, Users, CalendarRange, Archive, ArchiveRestore, MoreHorizontal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { TripWithMembers } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ongoingDayNumber } from '@/lib/tripStatus';
import TripDestination from './TripDestination';

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
  // 進行中標記（5.1）：今天落在行程日期區間內時顯示「旅行中 · Day N」。
  const ongoingDay = isArchived ? null : ongoingDayNumber(trip.start_date, trip.end_date);

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
      <div className="absolute right-2 top-2 z-10" onClick={(event) => event.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-muted-foreground hover:text-foreground"
              aria-label={t('tripActions')}
            >
              <MoreHorizontal size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopyClick}>
              <Copy className="mr-2 h-4 w-4" />
              {t('copyInviteLink')}
            </DropdownMenuItem>
            {onToggleArchive && (
              <DropdownMenuItem onClick={handleArchiveClick}>
                {isArchived ? (
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                {isArchived ? t('unarchive') : t('archive')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CardContent className="p-6 flex flex-col h-full items-start text-left">
        {ongoingDay !== null && (
          <Badge className="mb-2 bg-primary text-primary-foreground hover:bg-primary">
            {t('ongoingBadge', { day: ongoingDay })}
          </Badge>
        )}
        <h3 className="text-lg font-semibold mb-2 text-foreground line-clamp-1 pr-8">
          {trip.name}
        </h3>

        {trip.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{trip.description}</p>
        )}

        <div className="mt-auto space-y-2 w-full">
          <TripDestination destination={trip.destination_location} truncate />

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

          <div className="mt-4 flex w-full items-center gap-2 pt-2">
            <Badge variant="outline" className="flex items-center gap-1 font-normal">
              <Users size={12} />
              {trip.member_count} {t('members')}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
