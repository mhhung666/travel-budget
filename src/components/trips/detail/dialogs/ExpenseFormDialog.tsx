'use client';

import { useState, useEffect } from 'react';
import { DollarSign, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORIES, DEFAULT_CATEGORY } from '@/constants/categories';
import type { Expense, ExpenseAttachment, Member, ItineraryDay } from '@/types';
import { cn } from '@/lib/utils';
import { computeSplits, type SplitMode } from '@/lib/expenseSplit';
import { ReceiptUploader } from '@/components/trips/detail/ReceiptAttachments';

// UI Components
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Checkbox } from '@/components/ui/checkbox';
import { TagInput } from '@/components/ui/tag-input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface ExpenseDialogData {
  payer_id: string;
  original_amount: string;
  currency: string;
  exchange_rate: string;
  description: string;
  category: string;
  date: string;
  splits: { user_id: string; share_amount: number }[];
  attachments: ExpenseAttachment[];
  /** 關聯的行程日 id（可複選）；不關聯時為空陣列。 */
  itinerary_day_ids: string[];
  /** 自訂標籤（可複選，自由文字）；無標籤時為空陣列。 */
  tags: string[];
}

interface ExpenseFormDialogProps {
  mode: 'add' | 'edit';
  tripId: string;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ExpenseDialogData) => Promise<void>;
  members: Member[];
  currentUser: { id: string } | null;
  expense?: Expense | null; // Required for edit mode
  /** 本 trip 的行程日（供「關聯行程日」下拉）；無則不顯示該欄位。 */
  itineraryDays?: ItineraryDay[];
  /** 本 trip 內其他支出已用過的標籤（供標籤輸入的自動完成建議）。 */
  existingTags?: string[];
}

export default function ExpenseFormDialog({
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
}: ExpenseFormDialogProps) {
  const tExpense = useTranslations('expense');
  const tCommon = useTranslations('common');
  const t = useTranslations();

  const [error, setError] = useState('');
  const [form, setForm] = useState({
    payer_id: '' as string,
    original_amount: '',
    currency: 'TWD',
    exchange_rate: '1.0',
    description: '',
    category: DEFAULT_CATEGORY,
    date: new Date().toISOString().split('T')[0],
  });

  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [splitState, setSplitState] = useState<
    Record<string, { selected: boolean; value: string }>
  >({});
  const [showAdvanced, setShowAdvanced] = useState(mode === 'edit'); // Default expanded for edit
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  const [itineraryDayIds, setItineraryDayIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // Exchange rate states
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState('');

  // Fetch exchange rates
  const fetchExchangeRates = async () => {
    setLoadingRates(true);
    setRatesError('');
    try {
      const response = await fetch('/api/exchange-rates');
      const data = await response.json();

      if (data.success) {
        setExchangeRates(data.rates);
      } else {
        setRatesError('無法獲取匯率');
        if (data.rates) {
          setExchangeRates(data.rates);
        }
      }
    } catch {
      setRatesError('獲取匯率失敗');
    } finally {
      setLoadingRates(false);
    }
  };

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && expense) {
        // Edit mode: Load existing expense data
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時帶入支出資料，為刻意的同步
        setForm({
          payer_id: expense.payer_id,
          original_amount: expense.original_amount.toString(),
          currency: expense.currency,
          exchange_rate: expense.exchange_rate.toString(),
          description: expense.description,
          category: expense.category || DEFAULT_CATEGORY,
          date: new Date(expense.date).toISOString().split('T')[0],
        });

        // Reconstruct split inputs from stored TWD shares. We don't persist the
        // split mode, so infer it: all-equal shares → 'equal' (blank inputs),
        // otherwise → 'amount' with each member's reconstructed original amount.
        const exchangeRate = parseFloat(expense.exchange_rate.toString()) || 1;
        const originalShares = expense.splits.map((s) => s.share_amount / exchangeRate);
        const allEqual =
          originalShares.length > 0 &&
          originalShares.every((v) => Math.abs(v - originalShares[0]) < 0.01);
        const inferredMode: SplitMode = allEqual ? 'equal' : 'amount';
        setSplitMode(inferredMode);

        const initialSplits: Record<string, { selected: boolean; value: string }> = {};
        members.forEach((m) => {
          const existingSplit = expense.splits.find((s) => s.user_id === m.id);
          if (existingSplit) {
            const originalAmount = existingSplit.share_amount / exchangeRate;
            initialSplits[m.id] = {
              selected: true,
              value:
                inferredMode === 'equal'
                  ? ''
                  : originalAmount.toFixed(expense.currency === 'JPY' ? 0 : 2),
            };
          } else {
            initialSplits[m.id] = { selected: false, value: '' };
          }
        });
        setSplitState(initialSplits);
        setAttachments(expense.attachments ?? []);
        setItineraryDayIds(expense.itinerary_day_ids ?? []);
        setTags(expense.tags ?? []);
      } else {
        // Add mode: Initialize with defaults
        setForm({
          payer_id: currentUser?.id || members[0]?.id || '',
          original_amount: '',
          currency: 'TWD',
          exchange_rate: '1.0',
          description: '',
          category: DEFAULT_CATEGORY,
          date: new Date().toISOString().split('T')[0],
        });

        // Init splits: everyone selected, equal split (no manual values)
        setSplitMode('equal');
        const initialSplits: Record<string, { selected: boolean; value: string }> = {};
        members.forEach((m) => {
          initialSplits[m.id] = { selected: true, value: '' };
        });
        setSplitState(initialSplits);
        setAttachments([]);
        setItineraryDayIds([]);
        setTags([]);
      }

      setError('');
      setShowAdvanced(mode === 'edit');
      fetchExchangeRates();
    }
  }, [open, mode, expense, members, currentUser]);

  // Split calculation is delegated to the pure helper (lib/expenseSplit, unit
  // tested). Inputs are in the original currency; shares are converted to TWD
  // for storage in Expense.splits[].shareAmount.
  const originalAmount = parseFloat(form.original_amount) || 0;
  const exchangeRate = parseFloat(form.exchange_rate) || 1;
  const totalAmountTWD = originalAmount * exchangeRate;
  const anySelected = members.some((m) => splitState[m.id]?.selected);

  const split = computeSplits(
    splitMode,
    members.map((m) => ({
      id: m.id,
      selected: splitState[m.id]?.selected ?? false,
      value: splitState[m.id]?.value ?? '',
    })),
    originalAmount,
    exchangeRate
  );
  const isValidSplit = split.balanced;

  let splitWarning = '';
  if (!anySelected) {
    splitWarning = tExpense('error.noMembersSelected');
  } else if (split.imbalance === 'over') {
    splitWarning =
      splitMode === 'percent'
        ? tExpense('split.percentExceeds')
        : tCommon('error.splitExceedsTotal');
  } else if (split.imbalance === 'under') {
    splitWarning =
      splitMode === 'percent'
        ? tExpense('split.percentShort')
        : tCommon('error.splitNotFullyAllocated');
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidSplit) {
      setError(splitWarning);
      return;
    }

    try {
      // Construct splits array (using TWD amounts for storage)
      const finalSplits = members
        .filter((m) => splitState[m.id]?.selected)
        .map((m) => ({
          user_id: m.id,
          share_amount: split.twd[m.id], // converted TWD share
        }));

      if (finalSplits.length === 0) {
        setError(tExpense('error.noMembersSelected'));
        return;
      }

      await onSubmit({
        ...form,
        splits: finalSplits,
        attachments,
        itinerary_day_ids: itineraryDayIds,
        tags,
      });
      // Parent handles close
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(tCommon('error.unknown'));
      }
    }
  };

  // Switching split mode clears per-member inputs (a value means different
  // things across modes) but keeps who's selected. ToggleGroup emits '' when
  // the active item is re-clicked — ignore that so a mode stays chosen.
  const handleModeChange = (next: string) => {
    if (!next) return;
    setSplitMode(next as SplitMode);
    setSplitState((prev) => {
      const cleared: Record<string, { selected: boolean; value: string }> = {};
      for (const id of Object.keys(prev)) {
        cleared[id] = { selected: prev[id].selected, value: '' };
      }
      return cleared;
    });
  };

  const handleSplitToggle = (userId: string) => {
    setSplitState((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        selected: !prev[userId]?.selected,
        value: '', // reset the per-member input when toggling
      },
    }));
  };

  const handleValueChange = (userId: string, value: string) => {
    setSplitState((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        selected: true,
        value,
      },
    }));
  };

  const handleSelectAll = () => {
    const allSelected = members.every((m) => splitState[m.id]?.selected);
    const newState: Record<string, { selected: boolean; value: string }> = {};
    members.forEach((m) => {
      newState[m.id] = { selected: !allSelected, value: '' };
    });
    setSplitState(newState);
  };

  const handleCategorySelect = (categoryCode: string) => {
    setForm((prev) => ({ ...prev, category: categoryCode }));
  };

  // 關聯行程日可複選：勾選加入、取消移除。多天時金額於每日花費平均分攤（見 lib/tripStats）。
  const handleItineraryDayToggle = (dayId: string) => {
    setItineraryDayIds((prev) =>
      prev.includes(dayId) ? prev.filter((id) => id !== dayId) : [...prev, dayId]
    );
  };

  const currencies = [
    { code: 'TWD', label: 'TWD' },
    { code: 'JPY', label: 'JPY' },
    { code: 'USD', label: 'USD' },
    { code: 'EUR', label: 'EUR' },
    { code: 'HKD', label: 'HKD' },
    { code: 'THB', label: 'THB' },
  ];

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? tExpense('add') : tExpense('edit')}</DialogTitle>
          <DialogDescription className="hidden">Expense Form</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{tCommon('errorTitle')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Amount & Currency - Hero Section */}
          <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-xl border">
            <Input
              placeholder="0"
              value={form.original_amount}
              onChange={(e) => setForm({ ...form, original_amount: e.target.value })}
              required
              type="number"
              className="border-none shadow-none text-4xl font-bold h-16 bg-transparent focus-visible:ring-0 px-0"
              autoFocus
            />
            <Select
              value={form.currency}
              onValueChange={(value) => {
                const rate =
                  value === 'TWD' ? '1.0' : exchangeRates[value]?.toFixed(6) || form.exchange_rate;
                setForm({
                  ...form,
                  currency: value,
                  exchange_rate: rate,
                });
              }}
            >
              <SelectTrigger className="w-[100px] border-none bg-transparent text-lg font-medium focus:ring-0">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <Input
            placeholder={tExpense('form.descriptionPlaceholder')}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
          />

          {/* Category - Grid */}
          <div>
            <Label className="text-muted-foreground mb-2 block text-xs font-semibold uppercase tracking-wider">
              {tExpense('form.category')}
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map((cat) => {
                const isSelected = form.category === cat.code;
                return (
                  <div
                    key={cat.code}
                    onClick={() => handleCategorySelect(cat.code)}
                    className={cn(
                      'flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer transition-all border',
                      isSelected
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-transparent border-transparent hover:bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <span className="text-2xl mb-1">{cat.icon}</span>
                    <span
                      className={cn(
                        'text-xs truncate w-full text-center',
                        isSelected && 'font-semibold'
                      )}
                    >
                      {t(cat.nameKey)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Split Members */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                {tExpense('form.splitWith')}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-6 text-xs px-2"
              >
                {tCommon('toggleAll')}
              </Button>
            </div>

            {/* Split mode selector */}
            <ToggleGroup
              type="single"
              value={splitMode}
              onValueChange={handleModeChange}
              className="grid grid-cols-4 gap-1"
            >
              {(['equal', 'amount', 'percent', 'shares'] as SplitMode[]).map((m) => (
                <ToggleGroupItem
                  key={m}
                  value={m}
                  className="h-8 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {tExpense(`split.${m}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="space-y-2">
              {members.map((member) => {
                const state = splitState[member.id] || { selected: false, value: '' };
                const twdShare = split.twd[member.id] || 0;
                const unit =
                  splitMode === 'percent'
                    ? '%'
                    : splitMode === 'shares'
                      ? tExpense('split.shareUnit')
                      : form.currency;

                return (
                  <div
                    key={member.id}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-lg border transition-all',
                      state.selected
                        ? 'bg-primary/5 border-primary/20'
                        : 'bg-transparent border-border opacity-60'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={state.selected}
                        onCheckedChange={() => handleSplitToggle(member.id)}
                        id={`split-${member.id}`}
                      />
                      <Label htmlFor={`split-${member.id}`} className="cursor-pointer font-medium">
                        {member.display_name}
                      </Label>
                    </div>

                    {state.selected ? (
                      <div className="flex items-center gap-2">
                        {/* converted TWD share */}
                        <span className="text-xs text-muted-foreground tabular-nums">
                          ${Math.round(twdShare).toLocaleString()}
                        </span>
                        {splitMode !== 'equal' && (
                          <div className="flex items-center gap-1">
                            <Input
                              placeholder={splitMode === 'shares' ? '1' : '0'}
                              value={state.value}
                              onChange={(e) => handleValueChange(member.id, e.target.value)}
                              type="number"
                              min="0"
                              className="h-8 w-20 text-right pr-1 bg-background shadow-sm focus-visible:ring-1"
                            />
                            <span className="w-8 text-xs text-muted-foreground">{unit}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground pr-2">--</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Allocation summary (TWD) */}
            {anySelected && originalAmount > 0 && (
              <p className="px-1 text-xs text-muted-foreground tabular-nums">
                {tExpense('split.allocated', {
                  allocated: `$${Math.round(split.allocatedTWD).toLocaleString()}`,
                  total: `$${Math.round(totalAmountTWD).toLocaleString()}`,
                })}
              </p>
            )}

            {splitWarning && (
              <Alert className="bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-900">
                <DollarSign className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <AlertTitle className="text-yellow-800 dark:text-yellow-300">Warning</AlertTitle>
                <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                  {splitWarning}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Advanced Options Toggle */}
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-muted-foreground h-9 font-normal"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? tCommon('hideDetails') : tCommon('moreDetails')}
          </Button>

          {/* Advanced Options Content */}
          {showAdvanced && (
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg animate-in fade-in slide-in-from-top-2">
              <div className="space-y-2">
                <Label>{tExpense('form.payer')}</Label>
                <Select
                  value={form.payer_id.toString()}
                  onValueChange={(val) => setForm({ ...form, payer_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Payer" />
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
                <Label>{tExpense('form.date')}</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
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
                            onCheckedChange={() => handleItineraryDayToggle(day.id)}
                          />
                          <Label
                            htmlFor={`itinerary-day-${day.id}`}
                            className="cursor-pointer font-normal"
                          >
                            Day {day.day_number} · {day.title}
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
                  onChange={setTags}
                  suggestions={existingTags}
                  placeholder={tExpense('form.tagsPlaceholder')}
                />
              </div>

              {form.currency !== 'TWD' && (
                <div className="space-y-2">
                  <Label>{tExpense('form.exchangeRate')}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={form.exchange_rate}
                      onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
                      step="0.000001"
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={fetchExchangeRates}
                            disabled={loadingRates}
                            className="shrink-0"
                          >
                            {loadingRates ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Refresh Exchange Rate</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    1 {form.currency} = {parseFloat(form.exchange_rate).toFixed(4)} TWD
                  </p>
                  {ratesError && <p className="text-xs text-destructive">{ratesError}</p>}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>{tExpense('receipts.label')}</Label>
            <ReceiptUploader tripId={tripId} value={attachments} onChange={setAttachments} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={!isValidSplit || !form.original_amount}>
              {mode === 'add' ? tExpense('add') : tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
