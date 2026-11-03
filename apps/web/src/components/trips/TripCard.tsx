'use client';

import { useState } from 'react';

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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { dateFromLocalDateKey, getTripListPhase } from '@/lib/tripStatus';
import { pickLocalizedName } from '@/lib/utils';
import { TripCardFrame, TripCardLayout, TripCardSummary } from './TripCardLayout';
import { cardDates, cardNumber } from './tripCardFormat';

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
  const [mainPressed, setMainPressed] = useState(false);
  const t = useTranslations('trips');
  const locale = useLocale();
  const isArchived = trip.archived_at != null;
  const phase = getTripListPhase(trip);
  const settlement = phase === 'past' && Math.abs(trip.my_balance) >= 0.01;
  const currency = trip.ledger?.baseCurrency ?? 'TWD';
  const money = (amount: number) => `${cardNumber(amount, locale)} ${currency}`;
  const status = isArchived
    ? `${t('tabArchived')}${phase === 'past' ? '' : ` · ${t(`card.phase.${phase}`)}`}`
    : t(`card.phase.${phase}`);
  const destination = trip.destination_location
    ? pickLocalizedName(trip.destination_location.names, locale, trip.destination_location.name)
    : '';
  const balance =
    trip.my_balance === 0
      ? t('card.noBalance')
      : `${t(trip.my_balance > 0 ? 'card.receive' : 'card.pay')}: ${money(trip.my_balance)}`;

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
        ? cardDates(trip.start_date, trip.end_date, locale)!
        : t('card.partialDates', { start: date(trip.start_date), end: date(trip.end_date) });

  return (
    <TripCardFrame data-trip-card={trip.id} data-main-pressed={mainPressed}>
      <Link
        href={ROUTES.TRIP_DETAIL(trip.hash_code)}
        onPointerDown={(event) => {
          if (event.isPrimary && event.button === 0) setMainPressed(true);
        }}
        onPointerUp={() => setMainPressed(false)}
        onPointerCancel={() => setMainPressed(false)}
        onPointerLeave={() => setMainPressed(false)}
        onBlur={() => setMainPressed(false)}
        onContextMenu={() => setMainPressed(false)}
        aria-label={`${trip.name}, ${status}, ${dates}, ${destination ? `${destination} · ` : ''}${trip.member_count} ${t('members')}, ${t('card.myShare')}: ${money(trip.my_spent)}, ${balance}, ${t('card.openTrip')}`}
        className="trip-card-main absolute inset-0 z-0 rounded-[14px] focus-visible:outline-none"
      />
      <TripCardLayout
        title={<h3 className="break-words text-lg font-semibold text-foreground">{trip.name}</h3>}
        status={
          <span
            className={
              !isArchived && (phase === 'ongoing' || phase === 'upcoming')
                ? 'text-primary'
                : undefined
            }
          >
            {status}
          </span>
        }
        dates={dates}
        members={
          <span className="break-words">
            {destination && `${destination} · `}
            {trip.member_count} {t('members')}
          </span>
        }
        summary={
          <TripCardSummary
            characters={Math.max(
              cardNumber(trip.my_spent, locale).length,
              cardNumber(trip.my_balance, locale).length * 0.8
            )}
            left={
              <>
                <dt className="text-sm text-muted-foreground">{t('card.myShare')}</dt>
                <dd className="break-words font-semibold text-foreground">
                  {money(trip.my_spent)}
                </dd>
              </>
            }
            right={
              <>
                {trip.my_balance === 0 ? (
                  <>
                    <dt className="sr-only">{t('card.balanceLabel')}</dt>
                    <dd className="text-sm text-muted-foreground">{t('card.noBalance')}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-sm text-muted-foreground">
                      {t(trip.my_balance > 0 ? 'card.receive' : 'card.pay')}
                    </dt>
                    <dd className="break-words text-base text-foreground">
                      {money(trip.my_balance)}
                    </dd>
                  </>
                )}
              </>
            }
          />
        }
        open={
          <>
            {t('card.openTrip')}
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </>
        }
        more={
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
        }
        shortcut={
          !isArchived && (settlement || onQuickExpense) ? (
            settlement ? (
              <Button
                variant="outline"
                className="min-h-12 h-auto max-w-full rounded-xl whitespace-normal text-primary"
                asChild
              >
                <Link href={ROUTES.TRIP_SETTLEMENT(trip.hash_code)}>
                  <WalletCards className="h-4 w-4" />
                  {t('card.viewSettlement')}
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                className="min-h-12 h-auto max-w-full rounded-xl whitespace-normal text-primary"
                onClick={() => onQuickExpense?.(trip)}
              >
                <ReceiptText className="h-4 w-4" />
                {t('card.quickExpense')}
              </Button>
            )
          ) : undefined
        }
      />
    </TripCardFrame>
  );
}
