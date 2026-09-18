'use client';

import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, CalendarDays } from 'lucide-react';
import { intlLocale } from '@/lib/relativeTime';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  dateForDayNumber,
  dayNumberForDate,
  MAX_QUICK_PICK_DAYS,
  tripDateList,
} from '@/lib/itineraryDayTarget';

export interface ItineraryDayTargetFieldProps {
  /** 旅程有開始日→依日期挑；沒有開始日→退回「第幾天」正整數欄位。 */
  mode: 'date' | 'dayNumber';
  tripStartDate: string | null;
  tripEndDate: string | null;
  /** 已建立的行程日（dayNumber），用來標示不可重複選的日期。 */
  usedDayNumbers: Set<number>;
  date: string;
  dayNumber: number;
  onDateChange: (value: string) => void;
  onDayNumberChange: (value: number) => void;
  /** 已在地化的錯誤訊息；null＝無錯誤。 */
  error: string | null;
  /** 選到已建立的一天時，提供跳去看當天行程的出口。 */
  onViewExistingDay?: (dayNumber: number) => void;
  /** 沒有開始日時，引導去旅程設定補上。 */
  onOpenTripSettings?: () => void;
  disabled?: boolean;
}

function useDayFormatter() {
  const locale = useLocale();
  return (date: string, opts?: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
      ...opts,
    }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * 新增行程日的目標選擇。日期欄位是唯一輸入，Day N 只是推算出來的預覽；
 * 快捷鈕只在完整旅程範圍不超過 {@link MAX_QUICK_PICK_DAYS} 天時展開，長旅程改用「下一個未建立日期」捷徑。
 */
export function ItineraryDayTargetField({
  mode,
  tripStartDate,
  tripEndDate,
  usedDayNumbers,
  date,
  dayNumber,
  onDateChange,
  onDayNumberChange,
  error,
  onViewExistingDay,
  onOpenTripSettings,
  disabled,
}: ItineraryDayTargetFieldProps) {
  const t = useTranslations('itinerary.dayTarget');
  const formatDay = useDayFormatter();
  const errorId = 'itinerary-day-target-error';
  const describedBy = error ? errorId : 'itinerary-day-target-hint';

  if (mode === 'dayNumber') {
    return (
      <div className="space-y-2">
        <Label htmlFor="itinerary-day-number">{t('dayNumberLabel')}</Label>
        <Input
          id="itinerary-day-number"
          autoFocus
          type="number"
          min={1}
          inputMode="numeric"
          value={dayNumber || ''}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onDayNumberChange(Number(e.target.value))}
          required
        />
        <p id="itinerary-day-target-hint" className="text-xs text-muted-foreground">
          {t('noStartDate')}
          {onOpenTripSettings && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-1 py-0 text-xs"
              onClick={onOpenTripSettings}
            >
              {t('tripSettings')}
            </Button>
          )}
        </p>
        <TargetError id={errorId} message={error} />
      </div>
    );
  }

  const start = tripStartDate!;
  const allDates = tripDateList(start, tripEndDate);
  const showQuickPicks = allDates.length > 0 && allDates.length <= MAX_QUICK_PICK_DAYS;
  const previewDayNumber = date ? dayNumberForDate(start, date) : null;
  // 長旅程不渲染大量按鈕，改提供「跳到下一個未建立日期」。
  const nextUnused = (() => {
    const limit = allDates.length || Math.max(0, ...usedDayNumbers) + 1;
    for (let n = 1; n <= limit; n++) if (!usedDayNumbers.has(n)) return dateForDayNumber(start, n);
    return null;
  })();
  const takenDayNumber =
    previewDayNumber !== null && usedDayNumbers.has(previewDayNumber) ? previewDayNumber : null;

  return (
    <div className="space-y-2">
      <Label htmlFor="itinerary-day-date">{t('dateLabel')}</Label>
      <p className="text-xs text-muted-foreground">
        {tripEndDate
          ? t('tripRange', {
              start: formatDay(start, { year: 'numeric' }),
              end: formatDay(tripEndDate, { year: 'numeric' }),
            })
          : t('tripRangeOpen', { start: formatDay(start, { year: 'numeric' }) })}
      </p>
      <Input
        id="itinerary-day-date"
        autoFocus
        type="date"
        value={date}
        min={start}
        max={tripEndDate ?? undefined}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onDateChange(e.target.value)}
        required
      />

      {/* Day N 是推算結果，改日期時以 polite live region 播報，不搶焦點。 */}
      <p
        className="flex items-center gap-1 text-xs text-muted-foreground"
        aria-live="polite"
        id="itinerary-day-target-hint"
      >
        <CalendarDays className="h-3 w-3 shrink-0" />
        {previewDayNumber !== null
          ? t('preview', {
              dayNumber: previewDayNumber,
              date: formatDay(date, { weekday: 'short' }),
            })
          : t('pickDate')}
      </p>

      {showQuickPicks ? (
        <>
          <div className="flex flex-wrap gap-2">
            {allDates.map((value) => {
              const n = dayNumberForDate(start, value);
              const used = usedDayNumbers.has(n);
              const selected = value === date;
              return (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={selected ? 'default' : 'outline'}
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={t(used ? 'quickPickUsedA11y' : 'quickPickA11y', {
                    date: formatDay(value, { year: 'numeric', weekday: 'long' }),
                    dayNumber: n,
                  })}
                  className={cn('h-11 min-w-11 flex-col gap-0 px-3 text-xs', used && 'opacity-60')}
                  onClick={() => onDateChange(value)}
                >
                  <span>{formatDay(value)}</span>
                  {/* 狀態不只靠顏色：已建立／已選都有文字。 */}
                  <span className="text-[10px] font-normal">
                    {used ? t('quickPickUsed') : selected ? t('quickPickSelected') : `D${n}`}
                  </span>
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t('skipHint')}</p>
          {allDates.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('createdCount', {
                created: allDates.filter((_, i) => usedDayNumbers.has(i + 1)).length,
                total: allDates.length,
              })}
            </p>
          )}
        </>
      ) : (
        nextUnused && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onDateChange(nextUnused)}
          >
            {t('nextAvailable', { date: formatDay(nextUnused, { year: 'numeric' }) })}
          </Button>
        )
      )}

      <TargetError id={errorId} message={error} />
      {takenDayNumber !== null && onViewExistingDay && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onViewExistingDay(takenDayNumber)}
        >
          {t('viewExistingDay', { dayNumber: takenDayNumber })}
        </Button>
      )}
    </div>
  );
}

function TargetError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="flex items-start gap-1 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      {message}
    </p>
  );
}
