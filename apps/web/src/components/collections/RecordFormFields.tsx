'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link2 } from 'lucide-react';

import { useTrips } from '@/hooks/queries';
import { QueryFeedback } from '@/components/common/QueryFeedback';
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
  id,
  'aria-labelledby': labelledBy,
}: {
  /** YYYY-MM-DD；'' = 未填。 */
  id?: string;
  'aria-labelledby'?: string;
  date: string;
  precision: DatePrecision;
  onDateChange: (date: string) => void;
  onPrecisionChange: (precision: DatePrecision) => void;
}) {
  const t = useTranslations('collections');

  return (
    <div className="flex gap-2">
      <Select value={precision} onValueChange={(v) => onPrecisionChange(v as DatePrecision)}>
        <SelectTrigger aria-label={t('common.datePrecision')} className="w-28 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="day">{t('common.precision.day')}</SelectItem>
          <SelectItem value="month">{t('common.precision.month')}</SelectItem>
          <SelectItem value="year">{t('common.precision.year')}</SelectItem>
        </SelectContent>
      </Select>
      {precision === 'day' && (
        <Input
          id={id}
          aria-label={id ? undefined : t('common.date')}
          aria-labelledby={labelledBy}
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          required
        />
      )}
      {precision === 'month' && (
        <Input
          id={id}
          aria-label={id ? undefined : t('common.date')}
          aria-labelledby={labelledBy}
          type="month"
          value={date.slice(0, 7)}
          onChange={(e) => onDateChange(e.target.value ? `${e.target.value}-01` : '')}
          required
        />
      )}
      {precision === 'year' && (
        <YearInput labelledBy={labelledBy} id={id} date={date} onDateChange={onDateChange} />
      )}
    </div>
  );
}

function YearInput({
  id,
  labelledBy,
  date,
  onDateChange,
}: {
  labelledBy?: string;
  id?: string;
  date: string;
  onDateChange: (date: string) => void;
}) {
  const t = useTranslations('collections');
  const [year, setYear] = useState(date.slice(0, 4));
  const [lastDate, setLastDate] = useState(date);
  const [touched, setTouched] = useState(false);
  if (date !== lastDate) {
    setLastDate(date);
    setYear(date.slice(0, 4));
    setTouched(false);
  }
  const valid = /^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= 2100;
  return (
    <div className="min-w-0 flex-1">
      <Input
        id={id}
        aria-labelledby={labelledBy}
        aria-label={id ? undefined : t('common.date')}
        type="number"
        inputMode="numeric"
        min={1900}
        max={2100}
        required
        value={year}
        aria-invalid={touched && !valid}
        aria-describedby={touched && !valid && id ? `${id}-error` : undefined}
        onBlur={() => setTouched(true)}
        onChange={(e) => {
          const raw = e.target.value;
          setYear(raw);
          const next =
            /^\d{4}$/.test(raw) && Number(raw) >= 1900 && Number(raw) <= 2100 ? `${raw}-01-01` : '';
          setLastDate(next);
          onDateChange(next);
        }}
      />
      {touched && !valid && (
        <p
          id={id ? `${id}-error` : undefined}
          role="alert"
          className="mt-1 text-sm text-destructive"
        >
          {t('common.yearInvalid')}
        </p>
      )}
    </div>
  );
}

const NO_TRIP = 'none';

/** 可選的「連結旅程」下拉（value = trip id；null = 不連結）。 */
export function TripLinkSelect({
  value,
  onChange,
  id,
  'aria-labelledby': labelledBy,
}: {
  id?: string;
  'aria-labelledby'?: string;
  value: string | null;
  onChange: (tripId: string | null) => void;
}) {
  const t = useTranslations('collections');
  const query = useTrips();
  const { data: trips } = query;

  return (
    <>
      <QueryFeedback
        hasData={trips !== undefined}
        isError={query.isError}
        isFetching={query.isFetching}
        isPaused={query.isPaused}
        onRetry={() => void query.refetch()}
      />
      <Select
        disabled={trips === undefined}
        value={value ?? NO_TRIP}
        onValueChange={(v) => onChange(v === NO_TRIP ? null : v)}
      >
        <SelectTrigger
          id={id}
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : t('common.linkTrip')}
        >
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
    </>
  );
}

/**
 * 唯讀的「已連結旅程」欄位（行程一鍵帶入用）：帶入情境旅程已確定＝當下旅程，
 * 不再給下拉選（避免 hash_code/ObjectId 值不一致而顯示成「未連結」，也省去多餘操作）。
 */
export function LockedTripField({ name }: { name: string }) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-muted/50 px-3 text-sm">
      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate text-foreground">{name}</span>
    </div>
  );
}

/** 成就頁統計磚列（沿用 stats 頁的卡片質感，數字大字＋標籤小字）。 */
export function StatTiles({ tiles }: { tiles: { label: string; value: string | number }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{tile.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{tile.label}</div>
        </div>
      ))}
    </div>
  );
}
