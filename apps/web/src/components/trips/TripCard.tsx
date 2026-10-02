'use client';

import {
  Copy,
  Users,
  CalendarRange,
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  ReceiptText,
  WalletCards,
  Map as MapIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { TripWithMembers } from '@/types';
import { ROUTES } from '@/constants/routes';
import { formatCurrency } from '@/constants/currencies';
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
import { getTripCardStatus } from '@/lib/tripStatus';
import TripDestination from './TripDestination';

export interface TripCardProps {
  trip: TripWithMembers;
  onClick: () => void;
  onCopyCode: (code: string) => void;
  /** Toggle this trip's archived state (per-member). Omit to hide the control. */
  onToggleArchive?: (trip: TripWithMembers) => void;
  /** 在此旅行新增一筆支出。未傳即不顯示「記一筆」。 */
  onQuickExpense?: (trip: TripWithMembers) => void;
}

export default function TripCard({
  trip,
  onClick,
  onCopyCode,
  onToggleArchive,
  onQuickExpense,
}: TripCardProps) {
  const t = useTranslations('trips');
  const locale = useLocale();
  const isArchived = trip.archived_at != null;
  // 卡片狀態（UX #6）：即將出發／旅行中 · Day N／待結算／已結清；封存旅行不標。
  const status = getTripCardStatus(trip);
  const money = (amount: number) => formatCurrency(Math.abs(amount), 'TWD', locale);
  const budgetTotal = trip.budget?.total ?? null;
  const pending = status.kind === 'pendingSettlement';
  const summary = pending
    ? t(trip.my_balance > 0 ? 'card.youReceive' : 'card.youPay', {
        amount: money(trip.my_balance),
      })
    : budgetTotal !== null
      ? t('card.mySpentOfBudget', { spent: money(trip.my_spent), budget: money(budgetTotal) })
      : trip.my_spent > 0
        ? t('card.mySpent', { amount: money(trip.my_spent) })
        : null;

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
        {status.kind === 'ongoing' && (
          <Badge className="mb-2 bg-primary text-primary-foreground hover:bg-primary">
            {t('ongoingBadge', { day: status.day })}
          </Badge>
        )}
        {status.kind === 'upcoming' && (
          <Badge variant="secondary" className="mb-2">
            {t('card.upcoming', { days: status.daysUntil })}
          </Badge>
        )}
        {status.kind === 'pendingSettlement' && (
          <Badge className="mb-2 bg-warning text-warning-foreground hover:bg-warning">
            {t('card.pendingSettlement')}
          </Badge>
        )}
        {status.kind === 'settled' && (
          <Badge variant="outline" className="mb-2 font-normal text-muted-foreground">
            {t('card.settled')}
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

          <div className="mt-4 flex w-full flex-wrap items-center gap-2 pt-2">
            <Badge variant="outline" className="flex items-center gap-1 font-normal">
              <Users size={12} />
              {trip.member_count} {t('members')}
            </Badge>
            {summary && (
              <span
                className={cn(
                  'text-sm font-medium tabular-nums',
                  pending ? 'text-warning' : 'text-foreground'
                )}
              >
                {summary}
              </span>
            )}
          </div>

          {!isArchived && (
            // 按鈕自行處理導覽，不觸發整張卡片的點擊
            <div
              className="flex w-full flex-wrap gap-2 border-t pt-3"
              onClick={(event) => event.stopPropagation()}
            >
              {pending ? (
                <Button size="sm" asChild>
                  <Link href={ROUTES.TRIP_SETTLEMENT(trip.hash_code)}>
                    <WalletCards className="h-4 w-4" />
                    {t('card.viewSettlement')}
                  </Link>
                </Button>
              ) : (
                onQuickExpense && (
                  <Button size="sm" onClick={() => onQuickExpense(trip)}>
                    <ReceiptText className="h-4 w-4" />
                    {t('card.quickExpense')}
                  </Button>
                )
              )}
              <Button size="sm" variant="outline" asChild>
                <Link href={ROUTES.TRIP_DETAIL(trip.hash_code)}>
                  <MapIcon className="h-4 w-4" />
                  {t('card.viewItinerary')}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
