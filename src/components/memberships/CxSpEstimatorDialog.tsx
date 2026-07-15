'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { CX_AWARD_MILES_PER_SP, CX_EARN_VERIFIED_AT } from '@/constants/loyalty';
import { haversineKm } from '@/lib/geo';
import { estimateCxStatusPoints, KM_TO_MI } from '@/lib/loyalty';
import { useAirports } from '@/hooks/queries';
import type { CabinClass } from '@/types';
import { ResponsiveFormSheet } from '@/components/common';
import { AirportCombobox } from '@/components/collections/AirportCombobox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CxSpEstimatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CABINS: CabinClass[] = ['economy', 'premium_economy', 'business', 'first'];

/**
 * CX 積分試算器（PLAN-LOYALTY §8 Phase 3）：自選出發／到達機場＋客艙，依官方
 * 賺取表估算會籍積分與里數的 min–max 區間（同艙等內依票價類別差異大 → 只給區間，
 * 明示為預估）。純顯示、不落 DB；數字仍由使用者記帳時自填。
 */
export function CxSpEstimatorDialog({ open, onOpenChange }: CxSpEstimatorDialogProps) {
  const t = useTranslations('collections');

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [cabin, setCabin] = useState<CabinClass>('economy');

  const { data: airports } = useAirports(open);
  const airportByIata = useMemo(
    () => new Map((airports ?? []).map((a) => [a.iata, a])),
    [airports]
  );

  const result = useMemo(() => {
    const fromAirport = from ? airportByIata.get(from) : undefined;
    const toAirport = to ? airportByIata.get(to) : undefined;
    if (!fromAirport || !toAirport || from === to) return null;
    const distanceMi = Math.round(
      haversineKm([fromAirport.lat, fromAirport.lon], [toAirport.lat, toAirport.lon]) * KM_TO_MI
    );
    return {
      distanceMi,
      ...estimateCxStatusPoints(
        distanceMi,
        cabin,
        fromAirport.country ?? '',
        toAirport.country ?? ''
      ),
    };
  }, [airportByIata, from, to, cabin]);

  const nf = new Intl.NumberFormat();

  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('loyalty.estimatorTitle')}
      description={t('loyalty.estimatorDescription')}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('flights.from')}</Label>
            <AirportCombobox value={from} onChange={setFrom} placeholder={t('flights.from')} />
          </div>
          <div className="space-y-2">
            <Label>{t('flights.to')}</Label>
            <AirportCombobox value={to} onChange={setTo} placeholder={t('flights.to')} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('flights.cabin')}</Label>
          <Select value={cabin} onValueChange={(v) => setCabin(v as CabinClass)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CABINS.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`flights.cabins.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {result ? (
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">
              {t('loyalty.estimateDistance', {
                miles: nf.format(result.distanceMi),
                zone: t(`loyalty.zones.${result.zone}`),
              })}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-card p-4 text-center">
                <div className="text-xl font-bold text-foreground">
                  {nf.format(result.min)}–{nf.format(result.max)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('loyalty.statusPoints')}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4 text-center">
                <div className="text-xl font-bold text-foreground">
                  {nf.format(result.min * CX_AWARD_MILES_PER_SP)}–
                  {nf.format(result.max * CX_AWARD_MILES_PER_SP)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t('loyalty.awardMiles')}</div>
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('loyalty.estimatorEmpty')}
          </p>
        )}

        <p className="text-xs text-muted-foreground/70">
          {t('loyalty.earnDisclaimer', { date: CX_EARN_VERIFIED_AT })}
        </p>
      </div>
    </ResponsiveFormSheet>
  );
}
