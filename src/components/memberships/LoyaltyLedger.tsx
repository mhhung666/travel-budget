'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Hotel, Pencil, Plane, Plus, Trash2 } from 'lucide-react';

import type { LoyaltyEntryItem } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RecordYearGroups } from '@/components/collections/RecordYearGroups';

interface LoyaltyLedgerProps {
  /** 已過濾為單一 program、date 新到舊的 entries。 */
  entries: LoyaltyEntryItem[];
  onAdd: () => void;
  onEdit: (entry: LoyaltyEntryItem) => void;
  onDelete: (entry: LoyaltyEntryItem) => void;
}

/**
 * 單一會籍計畫的積分／哩程逐筆 ledger（docs/PLAN-LOYALTY.md §7）。
 * 一筆可同時帶會籍積分（CX）、卡籍哩程（BR）與可花里數——各項非 0 才顯示，
 * 同一元件通吃積分制與哩程＋航段制。
 */
export function LoyaltyLedger({ entries, onAdd, onEdit, onDelete }: LoyaltyLedgerProps) {
  const t = useTranslations('collections');
  const locale = useLocale();
  const numberFormat = new Intl.NumberFormat(locale);
  const signed = (n: number) => `${n > 0 ? '+' : ''}${numberFormat.format(n)}`;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">{t('common.records')}</h3>
        <Button size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" />
          {t('loyalty.addEntry')}
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('loyalty.entriesEmpty')}
        </p>
      ) : (
        <RecordYearGroups
          items={entries}
          getDate={(e) => e.date}
          renderRow={(e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Badge variant="secondary" className="text-xs">
                    {t(`loyalty.types.${e.type}`)}
                  </Badge>
                  {e.status_points !== 0 && (
                    <span className="text-sm font-medium text-foreground">
                      {t('loyalty.pointsAmount', { points: signed(e.status_points) })}
                    </span>
                  )}
                  {e.qualifying_miles !== 0 && (
                    <span className="text-sm font-medium text-foreground">
                      {t('loyalty.qualifyingAmount', { miles: signed(e.qualifying_miles) })}
                    </span>
                  )}
                  {e.award_miles !== 0 && (
                    <span className="text-sm text-muted-foreground">
                      {t('loyalty.milesAmount', { miles: signed(e.award_miles) })}
                    </span>
                  )}
                  {e.qualifying_nights !== 0 && (
                    <span className="text-sm font-medium text-foreground">
                      {t('loyalty.nightsAmount', { nights: signed(e.qualifying_nights) })}
                    </span>
                  )}
                  {e.qualifying_spend_usd !== 0 && (
                    <span className="text-sm text-muted-foreground">
                      {t('loyalty.spendAmount', { spend: signed(e.qualifying_spend_usd) })}
                    </span>
                  )}
                  {e.reward_points !== 0 && (
                    <span className="text-sm text-muted-foreground">
                      {t('loyalty.rewardPointsAmount', { points: signed(e.reward_points) })}
                    </span>
                  )}
                  {e.own_airline && e.type === 'flight' && (
                    <span className="inline-flex" title={t('loyalty.ownAirlineMarker')}>
                      <Plane className="h-3.5 w-3.5 text-primary" aria-hidden />
                      <span className="sr-only">{t('loyalty.ownAirlineMarker')}</span>
                    </span>
                  )}
                  {e.flight_record_id && (
                    <span className="inline-flex" title={t('loyalty.linkedFlightMarker')}>
                      <Plane className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <span className="sr-only">{t('loyalty.linkedFlightMarker')}</span>
                    </span>
                  )}
                  {e.stay_record_id && (
                    <span className="inline-flex" title={t('loyalty.linkedStayMarker')}>
                      <Hotel className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <span className="sr-only">{t('loyalty.linkedStayMarker')}</span>
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{e.date}</span>
                  {e.note && <span className="truncate">{e.note}</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t('common.edit')}
                  onClick={() => onEdit(e)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  aria-label={t('common.delete')}
                  onClick={() => onDelete(e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        />
      )}
    </section>
  );
}
