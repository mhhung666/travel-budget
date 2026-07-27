'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { normalizeUnsignedDecimalInput } from '@/lib/decimalInput';
import { CURRENCY_OPTIONS } from './currencies';

interface AmountFieldProps {
  amount: string;
  currency: string;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (currency: string) => void;
  /** 幣別選項（旅程常用幣別排前）；未傳則用預設順序。 */
  currencyOptions?: string[];
}

/**
 * 金額 Hero 區：大字數字輸入（自動聚焦、數字鍵盤）＋幣別。
 * 幣別留在金額旁而不收進進階——旅途中記外幣是本 App 的核心場景，一鍵可及。
 */
export function AmountField({
  amount,
  currency,
  onAmountChange,
  onCurrencyChange,
  currencyOptions,
}: AmountFieldProps) {
  const t = useTranslations('expense.form');
  const options = currencyOptions ?? CURRENCY_OPTIONS.map((c) => c.code);
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-muted/50 p-4">
      <Label htmlFor="expense-amount" className="sr-only">
        {t('amount')}
      </Label>
      <Input
        id="expense-amount"
        aria-label={t('amount')}
        placeholder="0"
        value={amount}
        onChange={(e) => {
          const normalized = normalizeUnsignedDecimalInput(e.target.value);
          if (normalized !== null) onAmountChange(normalized);
        }}
        required
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="h-16 border-none bg-transparent px-0 text-4xl font-bold tabular-nums shadow-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        autoFocus
      />
      <Select value={currency} onValueChange={onCurrencyChange}>
        <SelectTrigger
          aria-label={t('currency')}
          className="h-11 w-[100px] border-none bg-transparent text-lg font-medium"
        >
          <SelectValue placeholder={t('currency')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((code) => (
            <SelectItem key={code} value={code}>
              {code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
