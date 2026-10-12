'use client';

import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Copy,
  MoreHorizontal,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { TripWithMembers } from '@/types';
import { ROUTES } from '@/constants/routes';
import { formatCurrency } from '@/constants/currencies';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { dateFromLocalDateKey, getTripListPhase } from '@/lib/tripStatus';
import TripDestination from './TripDestination';

export interface TripCardProps {
  trip: TripWithMembers;
  onCopyCode: (code: string) => void;
  onToggleArchive?: (trip: TripWithMembers) => void;
  onQuickExpense?: (trip: TripWithMembers) => void;
  disabled?: boolean;
}

export default function TripCard({
  trip,
  onCopyCode,
  onToggleArchive,
  onQuickExpense,
  disabled = false,
}: TripCardProps) {
  const t = useTranslations('trips');
  const locale = useLocale();
  const isArchived = trip.archived_at != null;
  const phase = getTripListPhase(trip);
  const settlement = phase === 'past' && Math.abs(trip.my_balance) >= 0.01;
  const currency = trip.ledger?.baseCurrency ?? 'TWD';
  const money = (amount: number) =>
    `${currency} · ${formatCurrency(Math.abs(amount), currency, locale)}`;
  const date = (value: string | null) => {
    const parsed = value && dateFromLocalDateKey(value.slice(0, 10));
    return parsed
      ? parsed.toLocaleDateString(
          locale === 'zh'
            ? 'zh-TW'
            : locale === 'jp'
              ? 'ja-JP'
              : locale === 'zh-CN'
                ? 'zh-CN'
                : 'en-US'
        )
      : t('card.notSet');
  };
  const dates =
    !trip.start_date && !trip.end_date
      ? t('noDateGroup')
      : trip.start_date && trip.end_date
        ? `${date(trip.start_date)} — ${date(trip.end_date)}`
        : t('card.partialDates', { start: date(trip.start_date), end: date(trip.end_date) });

  return (
    <Card
      data-trip-card={trip.id}
      className="flex h-full flex-col rounded-2xl border-border bg-card shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Link
          href={ROUTES.TRIP_DETAIL(trip.hash_code)}
          className="min-h-12 min-w-0 flex-1 space-y-3 rounded-2xl p-4 text-left transition-colors hover:bg-muted/40 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <h3 className="break-words text-xl font-semibold text-foreground">{trip.name}</h3>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{t(`card.phase.${phase}`)}</Badge>
            {isArchived && <Badge variant="outline">{t('tabArchived')}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{dates}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <TripDestination destination={trip.destination_location} />
            <span>
              {trip.member_count} {t('members')}
            </span>
          </div>
          <dl className="space-y-2 text-base">
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">{t('card.myShare')}</dt>
              <dd className="break-words font-semibold tabular-nums">{money(trip.my_spent)}</dd>
            </div>
            {trip.budget?.total != null && (
              <div className="text-sm text-muted-foreground">
                <dt className="sr-only">{t('card.budgetLabel')}</dt>
                <dd>{t('card.budget', { amount: money(trip.budget.total) })}</dd>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">
                {t(
                  trip.my_balance === 0
                    ? 'card.noBalance'
                    : trip.my_balance > 0
                      ? 'card.receive'
                      : 'card.pay'
                )}
              </dt>
              <dd className="break-words font-semibold tabular-nums">{money(trip.my_balance)}</dd>
            </div>
          </dl>
          <span className="flex items-center gap-2 text-sm text-primary">
            {t('card.openTrip')}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
        <div className="mr-2 mt-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 text-muted-foreground"
                aria-label={t('card.more', { name: trip.name })}
              >
                <MoreHorizontal size={20} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] space-y-2">
              <DropdownMenuItem
                className="min-h-12 whitespace-normal"
                onSelect={() => onCopyCode(trip.hash_code)}
              >
                <Copy className="mr-2 h-4 w-4 shrink-0" />
                {t('copyInviteLink')}
              </DropdownMenuItem>
              {onToggleArchive && (
                <DropdownMenuItem
                  disabled={disabled}
                  className="min-h-12 whitespace-normal"
                  onSelect={() => onToggleArchive(trip)}
                >
                  {isArchived ? (
                    <ArchiveRestore className="mr-2 h-4 w-4 shrink-0" />
                  ) : (
                    <Archive className="mr-2 h-4 w-4 shrink-0" />
                  )}
                  {isArchived ? t('unarchive') : t('archive')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!isArchived && (settlement || onQuickExpense) && (
        <div className="mt-auto flex justify-end border-t border-border p-2">
          {settlement ? (
            <Button variant="ghost" className="min-h-12 whitespace-normal text-primary" asChild>
              <Link href={ROUTES.TRIP_SETTLEMENT(trip.hash_code)}>
                <WalletCards className="h-4 w-4" />
                {t('card.viewSettlement')}
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="min-h-12 whitespace-normal text-primary"
              onClick={() => onQuickExpense?.(trip)}
            >
              <ReceiptText className="h-4 w-4" />
              {t('card.quickExpense')}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
