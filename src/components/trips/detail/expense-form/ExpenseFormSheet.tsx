'use client';

import { ChevronDown, ChevronUp, DollarSign, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getPinnedRate, getTripExpenseCurrencies } from '@/lib/tripCurrency';
import type { Expense, ItineraryDay, Member, TripCurrencySettings } from '@/types';

import { ResponsiveFormSheet } from '@/components/common';
import { ReceiptUploader } from '@/components/trips/detail/ReceiptAttachments';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { AmountField } from './AmountField';
import { CategoryPicker } from './CategoryPicker';
import { SplitSection } from './SplitSection';
import { AdvancedFields } from './AdvancedFields';
import { useExpenseForm, type ExpenseFormData } from './useExpenseForm';

interface ExpenseFormSheetProps {
  mode: 'add' | 'edit';
  tripId: string;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ExpenseFormData) => Promise<void>;
  members: Member[];
  currentUser: { id: string } | null;
  expense?: Expense | null; // Required for edit mode
  /** 本 trip 的行程日（供「關聯行程日」勾選）；無則不顯示該欄位。 */
  itineraryDays?: ItineraryDay[];
  /** 本 trip 內其他支出已用過的標籤（供標籤輸入的自動完成建議）。 */
  existingTags?: string[];
  /** 新增模式的預填描述（如清單購物項的品名）；編輯模式忽略。 */
  initialDescription?: string;
  /** 旅程幣別設定（預設幣別／常用排序／自訂匯率）；null/未傳 = 未設定。 */
  currencySettings?: TripCurrencySettings | null;
}

const FORM_ID = 'expense-form';

/**
 * 新增／編輯支出表單（UI/UX 重設計 5.3 —— 最高頻操作）。
 * 欄位按輸入頻率排序：金額（大字、自動聚焦）→ 描述 → 分類 → 送出；
 * 付款人／日期／分帳／行程日／標籤／匯率／收據收進「進階」折疊區，
 * 預設值＝今天、TWD、平分全員，理想流程三步完成。
 * 行動端為全螢幕 Sheet、桌機為 Dialog（ResponsiveFormSheet 雙形態）。
 */
export default function ExpenseFormSheet({
  mode,
  tripId,
  open,
  onClose,
  onSubmit,
  members,
  currentUser,
  expense,
  itineraryDays = [],
  existingTags = [],
  initialDescription,
  currencySettings = null,
}: ExpenseFormSheetProps) {
  const tExpense = useTranslations('expense');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [submitting, setSubmitting] = useState(false);

  const {
    form,
    setForm,
    error,
    setError,
    splitMode,
    splitState,
    showAdvanced,
    setShowAdvanced,
    attachments,
    setAttachments,
    itineraryDayIds,
    tags,
    setTags,
    exchangeRates,
    loadingRates,
    ratesError,
    fetchExchangeRates,
    originalAmount,
    totalAmountTWD,
    anySelected,
    split,
    isValidSplit,
    splitWarning,
    buildSubmitData,
    handleModeChange,
    handleSplitToggle,
    handleValueChange,
    handleSelectAll,
    handleItineraryDayToggle,
  } = useExpenseForm({
    mode,
    open,
    members,
    currentUser,
    expense,
    initialDescription,
    currencySettings,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidSplit) {
      setError(splitWarning);
      return;
    }

    const data = buildSubmitData();
    if (!data) return;

    setSubmitting(true);
    try {
      await onSubmit(data);
      // Parent handles close
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tCommon('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  };

  // 匯率帶入順序：TWD 固定 1 → 旅程自訂匯率 → 即時匯率 → 保留原值
  const handleCurrencyChange = (value: string) => {
    const pinned = getPinnedRate(currencySettings, value);
    const rate =
      value === 'TWD'
        ? '1.0'
        : pinned != null
          ? String(pinned)
          : exchangeRates[value]?.toFixed(6) || form.exchange_rate;
    setForm({ ...form, currency: value, exchange_rate: rate });
  };

  // 折疊時的預設摘要（日期 · 付款人 · 分帳模式），讓使用者不展開也知道會存什麼。
  const payerName = members.find((m) => m.id === form.payer_id)?.display_name ?? '';
  const defaultsSummary = [
    new Date(`${form.date}T00:00:00`).toLocaleDateString(
      locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale
    ),
    payerName,
    tExpense(`split.${splitMode}`),
  ]
    .filter(Boolean)
    .join(' · ');

  const submitLabel = mode === 'add' ? tExpense('add') : tCommon('save');

  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={(val) => !val && onClose()}
      title={mode === 'add' ? tExpense('add') : tExpense('edit')}
      description="Expense Form"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} className="max-md:hidden">
            {tCommon('cancel')}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={submitting || !isValidSplit || !form.original_amount}
            className="max-md:h-12 max-md:w-full max-md:text-base"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{tCommon('errorTitle')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* 1. 金額（Hero）＋幣別 */}
        <AmountField
          amount={form.original_amount}
          currency={form.currency}
          onAmountChange={(value) => setForm({ ...form, original_amount: value })}
          onCurrencyChange={handleCurrencyChange}
          currencyOptions={getTripExpenseCurrencies(currencySettings, form.currency)}
        />

        {/* 2. 描述 */}
        <Input
          placeholder={tExpense('form.descriptionPlaceholder')}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          required
        />

        {/* 3. 分類（icon 網格） */}
        <CategoryPicker
          value={form.category}
          onChange={(category) => setForm((prev) => ({ ...prev, category }))}
        />

        {/* 4. 進階（折疊；預設：今天、目前使用者付款、平分全員） */}
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-between px-2 py-2 font-normal text-muted-foreground"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
        >
          <span className="flex flex-col items-start gap-0.5">
            <span>{showAdvanced ? tCommon('hideDetails') : tCommon('moreDetails')}</span>
            {!showAdvanced && <span className="text-xs">{defaultsSummary}</span>}
          </span>
          {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        {showAdvanced && (
          <div className="space-y-4 rounded-lg bg-muted/30 p-4 animate-in fade-in slide-in-from-top-2">
            <AdvancedFields
              payerId={form.payer_id}
              date={form.date}
              currency={form.currency}
              exchangeRate={form.exchange_rate}
              onPayerChange={(payer_id) => setForm((prev) => ({ ...prev, payer_id }))}
              onDateChange={(date) => setForm((prev) => ({ ...prev, date }))}
              onExchangeRateChange={(exchange_rate) =>
                setForm((prev) => ({ ...prev, exchange_rate }))
              }
              members={members}
              itineraryDays={itineraryDays}
              itineraryDayIds={itineraryDayIds}
              onItineraryDayToggle={handleItineraryDayToggle}
              tags={tags}
              onTagsChange={setTags}
              existingTags={existingTags}
              loadingRates={loadingRates}
              ratesError={ratesError}
              onRefreshRates={fetchExchangeRates}
            />

            <SplitSection
              members={members}
              splitMode={splitMode}
              splitState={splitState}
              split={split}
              currency={form.currency}
              anySelected={anySelected}
              originalAmount={originalAmount}
              totalAmountTWD={totalAmountTWD}
              onModeChange={handleModeChange}
              onToggle={handleSplitToggle}
              onValueChange={handleValueChange}
              onSelectAll={handleSelectAll}
            />

            <div className="space-y-2">
              <Label>{tExpense('receipts.label')}</Label>
              <ReceiptUploader tripId={tripId} value={attachments} onChange={setAttachments} />
            </div>
          </div>
        )}

        {/* 分帳警告固定顯示在折疊區之外——收合狀態下送出鍵被停用時，原因仍看得到 */}
        {splitWarning && (
          <Alert variant="warning">
            <DollarSign className="h-4 w-4" />
            <AlertTitle>{tCommon('warningTitle')}</AlertTitle>
            <AlertDescription>{splitWarning}</AlertDescription>
          </Alert>
        )}
      </form>
    </ResponsiveFormSheet>
  );
}
