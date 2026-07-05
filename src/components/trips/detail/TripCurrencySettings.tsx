'use client';

import { useEffect, useState } from 'react';
import { Coins, Loader2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { TripCurrencySettings } from '@/types';
import type { SetCurrencySettingsInput } from '@/lib/validation';
import { DEFAULT_CURRENCY, getCurrencyLabel } from '@/constants/currencies';
import { useExchangeRates } from '@/hooks/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import CurrencyCombobox from './CurrencyCombobox';

interface TripCurrencySettingsCardProps {
  settings: TripCurrencySettings | null;
  /** 只有 admin 能改（與預算、旅程資訊一致）；非 admin 唯讀展示。 */
  canEdit: boolean;
  onSave: (input: SetCurrencySettingsInput) => Promise<void>;
}

type Row = { code: string; rate: string };

/**
 * 旅程幣別設定卡（設定頁）：以可搜尋下拉加入這趟旅程會用到的幣別（全 ISO 4217），
 * 每個外幣可鎖定自訂匯率（如換現金的實際匯率；留空 = 用即時匯率），並指定新增支出的
 * 預設幣別。只影響之後的預填與顯示，既有支出保留當時匯率（不追溯）。
 */
export default function TripCurrencySettingsCard({
  settings,
  canEdit,
  onSave,
}: TripCurrencySettingsCardProps) {
  const t = useTranslations('trip');
  const locale = useLocale();
  const { data: liveRates = { TWD: 1 } } = useExchangeRates();

  const [rows, setRows] = useState<Row[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState(DEFAULT_CURRENCY);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // trip 載入 / 儲存成功後同步表單（settings 是 server 狀態的鏡像）
  useEffect(() => {
    const next: Row[] = (settings?.currencies ?? []).map((c) => ({
      code: c.code,
      rate: c.rate != null ? String(c.rate) : '',
    }));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 以 server 端設定同步表單，為刻意的同步
    setRows(next);
    setDefaultCurrency(settings?.default_currency ?? DEFAULT_CURRENCY);
  }, [settings]);

  const codes = rows.map((r) => r.code);
  // 預設幣別可選：基準幣 TWD + 已加入的幣別（去重）
  const defaultOptions = Array.from(new Set([DEFAULT_CURRENCY, ...codes]));

  const addCurrency = (code: string) => {
    setRows((prev) => (prev.some((r) => r.code === code) ? prev : [...prev, { code, rate: '' }]));
  };

  const removeCurrency = (code: string) => {
    setRows((prev) => prev.filter((r) => r.code !== code));
    setDefaultCurrency((prev) => (prev === code ? DEFAULT_CURRENCY : prev));
  };

  const setRate = (code: string, rate: string) =>
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, rate } : r)));

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      const currencies = rows.map((r) => {
        const n = parseFloat(r.rate);
        return {
          code: r.code,
          rate: r.code !== DEFAULT_CURRENCY && Number.isFinite(n) && n > 0 ? n : null,
        };
      });
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

        {canEdit && <CurrencyCombobox excluded={codes} onSelect={addCurrency} />}

        <div className="space-y-2">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
              {t('currencySettings.empty')}
            </p>
          ) : (
            rows.map((row) => {
              const isBase = row.code === DEFAULT_CURRENCY;
              const live = liveRates[row.code];
              return (
                <div key={row.code} className="flex items-center gap-3">
                  <div className="w-32 shrink-0">
                    <div className="text-sm font-medium">{row.code}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {getCurrencyLabel(row.code, locale)}
                    </div>
                  </div>
                  {isBase ? (
                    <span className="flex-1 text-xs text-muted-foreground">
                      {t('currencySettings.baseCurrency')}
                    </span>
                  ) : (
                    <Input
                      type="number"
                      min="0"
                      step="0.000001"
                      inputMode="decimal"
                      value={row.rate}
                      onChange={(e) => setRate(row.code, e.target.value)}
                      disabled={!canEdit}
                      placeholder={
                        live != null
                          ? t('currencySettings.ratePlaceholder', { rate: live.toFixed(4) })
                          : '—'
                      }
                      className="h-9 flex-1"
                    />
                  )}
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      onClick={() => removeCurrency(row.code)}
                      aria-label={t('currencySettings.remove')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-2">
          <Label>{t('currencySettings.defaultCurrencyLabel')}</Label>
          <Select value={defaultCurrency} onValueChange={setDefaultCurrency} disabled={!canEdit}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {defaultOptions.map((code) => (
                <SelectItem key={code} value={code}>
                  {code} · {getCurrencyLabel(code, locale)}
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
