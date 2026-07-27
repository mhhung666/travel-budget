'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ItineraryDay, Member } from '@/types';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TagInput } from '@/components/ui/tag-input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AdvancedFieldsProps {
  payerId: string;
  date: string;
  currency: string;
  exchangeRate: string;
  onPayerChange: (payerId: string) => void;
  onDateChange: (date: string) => void;
  onExchangeRateChange: (rate: string) => void;
  members: Member[];
  itineraryDays: ItineraryDay[];
  itineraryDayIds: string[];
  onItineraryDayToggle: (dayId: string) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  existingTags: string[];
  loadingRates: boolean;
  ratesError: string;
  onRefreshRates: () => void;
}

/** 進階欄位：付款人／日期／關聯行程日／標籤／匯率（分帳與收據由外層組進同一折疊區）。 */
export function AdvancedFields({
  payerId,
  date,
  currency,
  exchangeRate,
  onPayerChange,
  onDateChange,
  onExchangeRateChange,
  members,
  itineraryDays,
  itineraryDayIds,
  onItineraryDayToggle,
  tags,
  onTagsChange,
  existingTags,
  loadingRates,
  ratesError,
  onRefreshRates,
}: AdvancedFieldsProps) {
  const tExpense = useTranslations('expense');
  const tItinerary = useTranslations('itinerary');

  return (
    <>
      <div className="space-y-2">
        <Label>{tExpense('form.payer')}</Label>
        <Select value={payerId.toString()} onValueChange={onPayerChange}>
          <SelectTrigger aria-label={tExpense('form.payer')}>
            <SelectValue placeholder={tExpense('form.payerPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id.toString()}>
                {member.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="expense-date">{tExpense('form.date')}</Label>
        <Input
          id="expense-date"
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
        />
      </div>

      {itineraryDays.length > 0 && (
        <div className="space-y-2">
          <Label>{tExpense('form.itineraryDay')}</Label>
          <div className="space-y-2 rounded-lg border bg-background p-2">
            {itineraryDays.map((day) => {
              const checked = itineraryDayIds.includes(day.id);
              return (
                <div key={day.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`itinerary-day-${day.id}`}
                    checked={checked}
                    onCheckedChange={() => onItineraryDayToggle(day.id)}
                  />
                  <Label htmlFor={`itinerary-day-${day.id}`} className="cursor-pointer font-normal">
                    {tItinerary('dayLabel', { dayNumber: day.day_number })} · {day.title}
                  </Label>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {itineraryDayIds.length > 1
              ? tExpense('form.itineraryDaysAveraged', { count: itineraryDayIds.length })
              : tExpense('form.itineraryDaysHint')}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label>{tExpense('form.tags')}</Label>
        <TagInput
          value={tags}
          onChange={onTagsChange}
          suggestions={existingTags}
          placeholder={tExpense('form.tagsPlaceholder')}
        />
      </div>

      {currency !== 'TWD' && (
        <div className="space-y-2">
          <Label htmlFor="expense-exchange-rate">{tExpense('form.exchangeRate')}</Label>
          <div className="flex gap-2">
            <Input
              id="expense-exchange-rate"
              type="number"
              value={exchangeRate}
              onChange={(e) => onExchangeRateChange(e.target.value)}
              min="0"
              step="0.000001"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={onRefreshRates}
                    disabled={loadingRates}
                    className="h-11 w-11 shrink-0"
                    aria-label={tExpense('form.refreshRate')}
                  >
                    {loadingRates ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tExpense('form.refreshRate')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {Number(exchangeRate) > 0 && (
            <p className="text-xs text-muted-foreground">
              {tExpense('form.rateEquation', {
                currency,
                rate: Number(exchangeRate).toFixed(4),
              })}
            </p>
          )}
          {ratesError && <p className="text-xs text-destructive">{ratesError}</p>}
        </div>
      )}
    </>
  );
}
