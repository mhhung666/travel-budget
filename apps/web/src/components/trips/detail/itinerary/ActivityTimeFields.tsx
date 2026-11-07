'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MAX_ITINERARY_END_DAY_OFFSET } from '@travel-budget/contracts';
import { activityTimingLabels, activityTimingText } from '@/lib/activityTiming';
import { dateForDayNumber, dayDiff, isCalendarDate } from '@/lib/itineraryDayTarget';
import type { ActivityType } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

type Value = { time: string; endTime: string; endDayOffset: number | null; type: ActivityType };
export default function ActivityTimeFields({
  value,
  onChange,
  date,
  dayNumber = 1,
  endDate,
  startDate,
  onValidityChange,
  supported = true,
}: {
  value: Value;
  onChange: (fields: Partial<Pick<Value, 'time' | 'endTime' | 'endDayOffset'>>) => void;
  date?: string | null;
  dayNumber?: number;
  endDate?: string | null;
  startDate?: string | null;
  onValidityChange?: (valid: boolean) => void;
  supported?: boolean;
}) {
  const t = useTranslations('itinerary.timing');
  const id = useId();
  const [other, setOther] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [custom, setCustom] = useState('');
  const mode =
    other || (value.endDayOffset !== null && ![0, 1].includes(value.endDayOffset))
      ? 'other'
      : value.endDayOffset === null
        ? 'unknown'
        : String(value.endDayOffset);
  const text = activityTimingText(
    {
      time: value.time || null,
      end_time: value.endTime || null,
      end_day_offset: value.endDayOffset,
      type: value.type,
    },
    dayNumber,
    date,
    activityTimingLabels(t)
  );
  const validity = (valid: boolean) => {
    setInvalid(!valid);
    onValidityChange?.(valid);
  };
  const choose = (next: string) => {
    validity(true);
    setOther(next === 'other');
    if (next !== 'other') onChange({ endDayOffset: next === 'unknown' ? null : Number(next) });
    else {
      onChange({ endDayOffset: value.endDayOffset ?? 0 });
      setCustom(
        date
          ? dateForDayNumber(date, (value.endDayOffset ?? 0) + 1)
          : String(dayNumber + (value.endDayOffset ?? 0))
      );
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {(['time', 'endTime'] as const).map((field) => (
          <div key={field} className="min-w-0 space-y-1">
            <Label htmlFor={`${id}-${field}`}>
              {t(field === 'time' ? 'startTime' : 'endTime')}
            </Label>
            <Input
              id={`${id}-${field}`}
              type="time"
              className="min-h-11 min-w-0 max-w-full"
              value={value[field]}
              onChange={(e) => onChange({ [field]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-ends`}>{t('endsOn')}</Label>
        <Select value={mode} disabled={!supported} onValueChange={choose}>
          <SelectTrigger id={`${id}-ends`} className="min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{t('sameDay')}</SelectItem>
            <SelectItem value="1">{t('nextDay')}</SelectItem>
            <SelectItem value="other">{t(date ? 'otherDate' : 'otherDay')}</SelectItem>
            <SelectItem value="unknown">{t('unconfirmed')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mode === 'other' && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-custom`}>{t(date ? 'endDate' : 'endDay')}</Label>
          <Input
            id={`${id}-custom`}
            className="min-h-11 min-w-0 max-w-full"
            type={date ? 'date' : 'number'}
            step={date ? undefined : 1}
            disabled={!supported}
            value={
              other ? custom : date ? (text.endDate ?? '') : dayNumber + (value.endDayOffset ?? 0)
            }
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-invalid` : undefined}
            onChange={(e) => {
              const raw = e.target.value;
              setOther(true);
              setCustom(raw);
              const offset = date
                ? isCalendarDate(raw)
                  ? dayDiff(date, raw)
                  : NaN
                : raw.trim()
                  ? Number(raw) - dayNumber
                  : NaN;
              const valid =
                Number.isInteger(offset) && Math.abs(offset) <= MAX_ITINERARY_END_DAY_OFFSET;
              validity(valid);
              if (valid) onChange({ endDayOffset: offset });
            }}
          />
          {invalid && (
            <p id={`${id}-invalid`} role="alert" className="text-sm text-destructive">
              {t('invalidDate')}
            </p>
          )}
        </div>
      )}
      {!supported && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('unsupported')}
        </p>
      )}
      {!invalid && (
        <p className="break-words text-sm text-muted-foreground" aria-live="polite">
          {text.summary}
        </p>
      )}
      {supported &&
        value.time &&
        value.endTime &&
        value.endTime < value.time &&
        (value.endDayOffset === 0 || value.endDayOffset === null) && (
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-11 whitespace-normal"
            onClick={() => {
              choose('1');
            }}
          >
            {t('suggestNextDay')}
          </Button>
        )}
      {!invalid &&
        date &&
        text.endDate &&
        (text.endDate < (startDate ?? dateForDayNumber(date, 2 - dayNumber)) ||
          (!!endDate && text.endDate > endDate)) && (
          <p className="text-sm text-muted-foreground">{t('outsideRange')}</p>
        )}
    </div>
  );
}
