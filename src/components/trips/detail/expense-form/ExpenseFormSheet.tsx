'use client';

import { ArrowLeftRight, ChevronDown, ChevronUp, DollarSign, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatCurrency } from '@/constants/currencies';
import { getPinnedRate, getTripExpenseCurrencies } from '@/lib/tripCurrency';
import type { Expense, ItineraryDay, Member, TripCurrencySettings } from '@/types';

import { ConfirmDialog, ResponsiveFormSheet } from '@/components/common';
import { useToast } from '@/hooks/use-toast';
import { ReceiptUploader } from '@/components/trips/detail/ReceiptAttachments';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { AmountField } from './AmountField';
import { CategoryPicker } from './CategoryPicker';
import { SplitSection } from './SplitSection';
import { AdvancedFields } from './AdvancedFields';
import { PayerDateFields } from './PayerDateFields';
import { ExpenseAiInput } from './ExpenseAiInput';
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
  /** 正在記帳的旅行名稱；顯示在標題下方，降低記錯帳本的機會。 */
  tripName?: string;
  /** 提供時在表單頂端顯示「切換旅行」（全域快速記帳有多趟可選時）。 */
  onSwitchTrip?: () => void;
}

const FORM_ID = 'expense-form';

/** 被擋下的離開動作：為什麼要問，以及使用者確認後要執行什麼。 */
interface PendingLeave {
  reason: 'edit' | 'storage';
  proceed: () => void;
}

/**
 * 新增／編輯支出表單（UI/UX 重設計 5.3 —— 最高頻操作）。
 * 欄位按輸入頻率排序（docs/archive/history/UX_IMPROVEMENTS_2026-09-17.md 第 2 項）：
 * 旅行名稱（可切換）→ 金額（大字、自動聚焦）＋幣別 → 描述 → 分類
 * → 直接可改的付款人／日期／分帳摘要（點開即改分帳）→ 一句話記帳／掃描收據
 * →「更多設定」折疊區（行程日／標籤／匯率／收據）。
 * 預設值＝我付款、今天、全員均分，理想流程三步完成。
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
  tripName,
  onSwitchTrip,
}: ExpenseFormSheetProps) {
  const tExpense = useTranslations('expense');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  // 內容留不住時才擋下離開：編輯既有支出（不落地草稿），或草稿寫入失敗。
  const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null);

  const {
    form,
    setForm,
    error,
    setError,
    splitMode,
    splitState,
    showSplit,
    setShowSplit,
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
    hasValidAmount,
    totalAmountTWD,
    hasValidExchangeRate,
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
    applyTextDraft,
    applyReceiptDraft,
    isDirty,
    draftEnabled,
    draftRestored,
    persistDraft,
    clearDraft,
    discardDraft,
  } = useExpenseForm({
    mode,
    tripId,
    open,
    members,
    currentUser,
    expense,
    initialDescription,
    currencySettings,
  });

  /**
   * 表單要被收掉前的共同出口：×、點遮罩、Esc、手機下滑、footer 的「取消」，
   * 以及會把表單換掉的「切換旅行」（docs/UX_IMPROVEMENTS.md 第 1 項）。
   * - 新增模式：有填過就靜靜存成草稿並提示，下次打開接著填。
   * - 編輯模式：草稿不落地，改過就先問「繼續編輯／捨棄修改」。
   * - 草稿寫不進 localStorage（配額用盡等）：不謊報已保留，改成先問過再離開。
   */
  const leaveForm = (proceed: () => void) => {
    if (!isDirty()) {
      clearDraft();
      proceed();
      return;
    }
    if (draftEnabled) {
      if (persistDraft()) {
        toast({
          title: tExpense('form.draft.saved'),
          description: tExpense('form.draft.savedHint'),
        });
        proceed();
        return;
      }
      setPendingLeave({ reason: 'storage', proceed });
      return;
    }
    setPendingLeave({ reason: 'edit', proceed });
  };

  const handleRequestClose = () => leaveForm(onClose);
  // 切換旅行會立刻換掉整張表單，debounce 的自動存檔來不及跑，這裡先把草稿定下來。
  const handleSwitchTrip = onSwitchTrip ? () => leaveForm(onSwitchTrip) : undefined;

  const handleDiscardDraft = () => {
    discardDraft();
    toast({ title: tExpense('form.draft.discarded') });
  };

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
      clearDraft();
      // Parent handles close
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tCommon('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  };

  // 匯率帶入順序：TWD 固定 1 → 旅程自訂匯率 → 即時匯率。
  // 找不到新幣別的匯率時清空，不沿用前一個幣別的數字，以免靜默記錯。
  const handleCurrencyChange = (value: string) => {
    const pinned = getPinnedRate(currencySettings, value);
    const rate =
      value === 'TWD'
        ? '1.0'
        : pinned != null
          ? String(pinned)
          : exchangeRates[value]?.toFixed(6) || '';
    setForm({ ...form, currency: value, exchange_rate: rate });
  };

  const handleRefreshRates = async () => {
    const rates = await fetchExchangeRates();
    const live = rates?.[form.currency];
    if (live) {
      setForm((prev) => ({ ...prev, exchange_rate: live.toFixed(6) }));
    }
  };

  // 分帳收合時仍顯示結果摘要，讓快速流程不以隱藏分帳方式為代價。
  const selectedMemberIds = members
    .filter((member) => splitState[member.id]?.selected)
    .map((member) => member.id);
  const selectedCount = selectedMemberIds.length;
  const firstSelectedShare = selectedMemberIds[0] ? (split.twd[selectedMemberIds[0]] ?? 0) : 0;
  const firstShareLabel = hasValidExchangeRate
    ? formatCurrency(Math.round(firstSelectedShare), 'TWD', locale)
    : '—';
  const allocatedLabel = hasValidExchangeRate
    ? formatCurrency(Math.round(split.allocatedTWD), 'TWD', locale)
    : '—';
  const splitSummary =
    splitMode === 'equal'
      ? tExpense('form.summary.equalSplit', {
          count: selectedCount,
          amount: firstShareLabel,
        })
      : tExpense('form.summary.customSplit', {
          mode: tExpense(`split.${splitMode}`),
          count: selectedCount,
          allocated: allocatedLabel,
        });
  const conversionSummary =
    form.currency !== 'TWD' && originalAmount > 0
      ? hasValidExchangeRate
        ? tExpense('form.summary.converted', {
            original: formatCurrency(originalAmount, form.currency, locale),
            converted: formatCurrency(Math.round(totalAmountTWD), 'TWD', locale),
          })
        : loadingRates
          ? tExpense('form.summary.loadingRate')
          : tExpense('error.exchangeRateRequired')
      : null;

  const submitLabel = mode === 'add' ? tExpense('add') : tCommon('save');
  // 外幣缺匯率時強制展開「更多設定」，讓匯率欄位與錯誤訊息不被藏起來。
  const rateMissing = form.currency !== 'TWD' && !hasValidExchangeRate && !loadingRates;
  const advancedOpen = showAdvanced || rateMissing;
  const formTitle = mode === 'add' ? tExpense('add') : tExpense('edit');

  return (
    <>
      <ResponsiveFormSheet
        open={open}
        onOpenChange={(val) => !val && handleRequestClose()}
        title={
          tripName ? (
            <span className="flex min-w-0 flex-col">
              <span>{formTitle}</span>
              <span className="truncate text-sm font-normal text-muted-foreground">
                {tExpense('form.recordingTo', { trip: tripName })}
              </span>
            </span>
          ) : (
            formTitle
          )
        }
        description={tExpense('form.formDescription')}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleRequestClose}
              className="max-md:hidden"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              disabled={
                submitting ||
                !isValidSplit ||
                !hasValidAmount ||
                !hasValidExchangeRate ||
                !form.original_amount
              }
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

          {/* 帶回上次未完成的內容時明講，並給一鍵回到空白表單的出口 */}
          {draftRestored && (
            <Alert>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>{tExpense('form.draft.restored')}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  onClick={handleDiscardDraft}
                >
                  {tExpense('form.draft.discard')}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* 旅行名稱已常駐在標題下方；這裡只補切換入口，不重複顯示名稱 */}
          {handleSwitchTrip && (
            <div className="-mt-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSwitchTrip}
                className="min-h-11 gap-1.5 text-muted-foreground"
              >
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                {tExpense('form.switchTrip')}
              </Button>
            </div>
          )}

          {/* 1. 金額（Hero）＋幣別 */}
          <AmountField
            amount={form.original_amount}
            currency={form.currency}
            onAmountChange={(value) => setForm({ ...form, original_amount: value })}
            onCurrencyChange={handleCurrencyChange}
            currencyOptions={getTripExpenseCurrencies(currencySettings, form.currency)}
          />
          {conversionSummary && (
            <p
              className={
                hasValidExchangeRate
                  ? '-mt-2 px-1 text-xs text-muted-foreground'
                  : '-mt-2 px-1 text-xs font-medium text-destructive'
              }
            >
              {conversionSummary}
            </p>
          )}

          {/* 2. 描述 */}
          <Input
            id="expense-description"
            aria-label={tExpense('form.description')}
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

          {/* 4. 直接可改：付款人／日期／分帳（預設：我付款、今天、全員均分） */}
          <PayerDateFields
            payerId={form.payer_id}
            date={form.date}
            onPayerChange={(payer_id) => setForm((prev) => ({ ...prev, payer_id }))}
            onDateChange={(date) => setForm((prev) => ({ ...prev, date }))}
            members={members}
            currentUserId={currentUser?.id}
          />

          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-h-11 w-full justify-between rounded-lg border px-3 py-2 text-left font-normal hover:bg-muted/60"
              onClick={() => setShowSplit(!showSplit)}
              aria-expanded={showSplit}
            >
              <span className="flex min-w-0 flex-col items-start">
                <span className="text-xs text-muted-foreground">{tExpense('form.splitWith')}</span>
                <span className="truncate font-medium">{splitSummary}</span>
              </span>
              {showSplit ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showSplit && (
              <div className="rounded-lg bg-muted/30 p-3 animate-in fade-in slide-in-from-top-2">
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
              </div>
            )}
          </div>

          {/* 5. 次要入口：一句話記帳／掃描收據（AI 只產生草稿，套用後仍可在上方修改） */}
          {mode === 'add' && (
            <ExpenseAiInput
              open={open}
              tripId={tripId}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              members={members}
              onApplyTextDraft={applyTextDraft}
              onApplyReceiptDraft={applyReceiptDraft}
            />
          )}

          {/* 6. 更多設定（折疊）：行程日／標籤／匯率／收據 */}
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-11 w-full justify-between rounded-lg border bg-muted/30 px-3 py-2 text-left font-normal text-muted-foreground hover:bg-muted/60"
            onClick={() => setShowAdvanced(!advancedOpen)}
            aria-expanded={advancedOpen}
            disabled={rateMissing}
          >
            <span className="flex min-w-0 flex-col items-start">
              <span className="font-medium text-foreground">{tExpense('form.moreSettings')}</span>
              <span className="text-xs">
                {mode === 'edit'
                  ? tExpense('form.moreSettingsHintWithReceipts')
                  : tExpense('form.moreSettingsHint')}
              </span>
            </span>
            {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {advancedOpen && (
            <div className="space-y-4 rounded-lg bg-muted/30 p-4 animate-in fade-in slide-in-from-top-2">
              <AdvancedFields
                currency={form.currency}
                exchangeRate={form.exchange_rate}
                onExchangeRateChange={(exchange_rate) =>
                  setForm((prev) => ({ ...prev, exchange_rate }))
                }
                itineraryDays={itineraryDays}
                itineraryDayIds={itineraryDayIds}
                onItineraryDayToggle={handleItineraryDayToggle}
                tags={tags}
                onTagsChange={setTags}
                existingTags={existingTags}
                loadingRates={loadingRates}
                ratesError={hasValidExchangeRate ? '' : ratesError}
                onRefreshRates={handleRefreshRates}
              />

              {mode === 'edit' && (
                <div className="space-y-2">
                  <Label>{tExpense('receipts.label')}</Label>
                  <ReceiptUploader tripId={tripId} value={attachments} onChange={setAttachments} />
                </div>
              )}
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
      <ConfirmDialog
        open={pendingLeave != null}
        title={tExpense(
          pendingLeave?.reason === 'storage'
            ? 'form.draft.saveFailedTitle'
            : 'form.draft.unsavedTitle'
        )}
        message={tExpense(
          pendingLeave?.reason === 'storage'
            ? 'form.draft.saveFailedMessage'
            : 'form.draft.unsavedMessage'
        )}
        confirmText={tExpense(
          pendingLeave?.reason === 'storage'
            ? 'form.draft.discardContent'
            : 'form.draft.discardChanges'
        )}
        cancelText={tExpense('form.draft.keepEditing')}
        severity="warning"
        onConfirm={() => {
          const proceed = pendingLeave?.proceed;
          setPendingLeave(null);
          proceed?.();
        }}
        onCancel={() => setPendingLeave(null)}
      />
    </>
  );
}
