'use client';

import { useEffect, useState } from 'react';
import { Coins, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TripCurrencySettings } from '@/types';
import type { SetCurrencySettingsInput } from '@/lib/validation';
import { CURRENCY_CODES, DEFAULT_CURRENCY } from '@/constants/currencies';
import { useExchangeRates } from '@/hooks/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface TripCurrencySettingsCardProps {
  settings: TripCurrencySettings | null;
  /** 只有 admin 能改（與預算、旅程資訊一致）；非 admin 唯讀展示。 */
  canEdit: boolean;
  onSave: (input: SetCurrencySettingsInput) => Promise<void>;
}

type RowState = { selected: boolean; rate: string };

/**
 * 旅程幣別設定卡（設定頁）：勾選這趟旅程的常用幣別、可為外幣鎖定自訂匯率
 * （如換現金的實際匯率；留空 = 用即時匯率），並指定新增支出的預設幣別。
 * 只影響之後的預填與顯示，既有支出保留當時匯率（不追溯）。
 */
export default function TripCurrencySettingsCard({
  settings,
  canEdit,
  onSave,
}: TripCurrencySettingsCardProps) {
  const t = useTranslations('trip');
  const tCurrency = useTranslations('currency');
  const { data: liveRates = { TWD: 1 } } = useExchangeRates();

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [defaultCurrency, setDefaultCurrency] = useState(DEFAULT_CURRENCY);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // trip 載入 / 儲存成功後同步表單（settings 是 server 狀態的鏡像）
  useEffect(() => {
    const next: Record<string, RowState> = {};
    for (const code of CURRENCY_CODES) {
      const entry = settings?.currencies.find((c) => c.code === code);
      next[code] = { selected: !!entry, rate: entry?.rate != null ? String(entry.rate) : '' };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 以 server 端設定同步表單，為刻意的同步
    setRows(next);
    setDefaultCurrency(settings?.default_currency ?? DEFAULT_CURRENCY);
  }, [settings]);

  const selectedCodes = CURRENCY_CODES.filter((code) => rows[code]?.selected);
  // 預設幣別從「勾選的常用幣別」挑；都沒勾時退回全部幣別。
  // TWD（基準幣）與目前選定值恆在清單中，避免 Select 值對不到選項。
  const defaultOptions = Array.from(
    new Set([
      DEFAULT_CURRENCY,
      ...(selectedCodes.length > 0 ? selectedCodes : CURRENCY_CODES),
      defaultCurrency,
    ])
  );

  const toggle = (code: string) =>
    setRows((prev) => ({
      ...prev,
      [code]: { ...prev[code], selected: !prev[code]?.selected },
    }));

  const setRate = (code: string, rate: string) =>
    setRows((prev) => ({ ...prev, [code]: { ...prev[code], rate } }));

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      const currencies = selectedCodes.map((code) => {
        const n = parseFloat(rows[code]?.rate ?? '');
        return {
          code,
          rate: code !== DEFAULT_CURRENCY && Number.isFinite(n) && n > 0 ? n : null,
        };
      });
      // 預設幣別若沒被勾選（例如剛取消勾），仍存使用者選的值——選項清單本就含未勾幣別
      await onSave({
        default_currency: defaultCurrency === DEFAULT_CURRENCY ? null : defaultCurrency,
        currencies,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Coins className="h-4 w-4" />
          {t('currencySettings.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('currencySettings.description')}</p>

        <div className="space-y-2">
          {CURRENCY_CODES.map((code) => {
            const row = rows[code] ?? { selected: false, rate: '' };
            const live = liveRates[code];
            return (
              <div key={code} className="flex items-center gap-3">
                <Checkbox
                  id={`currency-${code}`}
                  checked={row.selected}
                  onCheckedChange={() => toggle(code)}
                  disabled={!canEdit}
                />
                <Label
                  htmlFor={`currency-${code}`}
                  className="w-28 shrink-0 cursor-pointer font-normal"
                >
                  {code} · {tCurrency(code)}
                </Label>
                {code === DEFAULT_CURRENCY ? (
                  <span className="text-xs text-muted-foreground">
                    {t('currencySettings.baseCurrency')}
                  </span>
                ) : (
                  <Input
                    type="number"
                    min="0"
                    step="0.000001"
                    inputMode="decimal"
                    value={row.rate}
                    onChange={(e) => setRate(code, e.target.value)}
                    disabled={!canEdit || !row.selected}
                    placeholder={
                      live != null
                        ? t('currencySettings.ratePlaceholder', { rate: live.toFixed(4) })
                        : '—'
                    }
                    className="h-9"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <Label>{t('currencySettings.defaultCurrencyLabel')}</Label>
          <Select value={defaultCurrency} onValueChange={setDefaultCurrency} disabled={!canEdit}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {defaultOptions.map((code) => (
                <SelectItem key={code} value={code}>
                  {code} · {tCurrency(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">{t('currencySettings.hint')}</p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {canEdit && (
          <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto gap-2">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('currencySettings.save')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
