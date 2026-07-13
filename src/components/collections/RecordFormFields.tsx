'use client';

import { useTranslations } from 'next-intl';

import { useTrips } from '@/hooks/queries';
import type { DatePrecision } from '@/types';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * 「日期＋精度」複合欄位：歷史回填常只記得年份/月份，precision 決定輸入型態，
 * 值一律正規化成 YYYY-MM-DD（month → 該月 1 日、year → 1/1），顯示時再依精度截短。
 */
export function DatePrecisionInput({
  date,
  precision,
  onDateChange,
  onPrecisionChange,
}: {
  /** YYYY-MM-DD；'' = 未填。 */
  date: string;
  precision: DatePrecision;
  onDateChange: (date: string) => void;
  onPrecisionChange: (precision: DatePrecision) => void;
}) {
  const t = useTranslations('collections');

  return (
    <div className="flex gap-2">
      <Select value={precision} onValueChange={(v) => onPrecisionChange(v as DatePrecision)}>
        <SelectTrigger className="w-28 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="day">{t('common.precision.day')}</SelectItem>
          <SelectItem value="month">{t('common.precision.month')}</SelectItem>
          <SelectItem value="year">{t('common.precision.year')}</SelectItem>
        </SelectContent>
      </Select>
      {precision === 'day' && (
        <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} required />
      )}
      {precision === 'month' && (
        <Input
          type="month"
          value={date.slice(0, 7)}
          onChange={(e) => onDateChange(e.target.value ? `${e.target.value}-01` : '')}
          required
        />
      )}
      {precision === 'year' && (
        <Input
          type="number"
          inputMode="numeric"
          min={1900}
          max={2100}
          placeholder="2018"
          value={date.slice(0, 4)}
          onChange={(e) => {
            const y = e.target.value;
            onDateChange(/^\d{4}$/.test(y) ? `${y}-01-01` : '');
          }}
          required
        />
      )}
    </div>
  );
}

const NO_TRIP = 'none';

/** 可選的「連結旅程」下拉（value = trip id；null = 不連結）。 */
export function TripLinkSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (tripId: string | null) => void;
}) {
  const t = useTranslations('collections');
  const { data: trips } = useTrips();

  return (
    <Select value={value ?? NO_TRIP} onValueChange={(v) => onChange(v === NO_TRIP ? null : v)}>
      <SelectTrigger>
        <SelectValue placeholder={t('common.noTrip')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TRIP}>{t('common.noTrip')}</SelectItem>
        {(trips ?? []).map((trip) => (
          <SelectItem key={trip.id} value={trip.id}>
            {trip.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 成就頁統計磚列（沿用 stats 頁的卡片質感，數字大字＋標籤小字）。 */
export function StatTiles({ tiles }: { tiles: { label: string; value: string | number }[] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{tile.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{tile.label}</div>
        </div>
      ))}
    </div>
  );
}
