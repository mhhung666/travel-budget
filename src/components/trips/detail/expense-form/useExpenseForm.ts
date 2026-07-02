'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DEFAULT_CATEGORY } from '@/constants/categories';
import { computeSplits, type SplitMode } from '@/lib/expenseSplit';
import type { Expense, ExpenseAttachment, Member } from '@/types';

export interface ExpenseFormData {
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

export type SplitState = Record<string, { selected: boolean; value: string }>;

interface UseExpenseFormArgs {
  mode: 'add' | 'edit';
  open: boolean;
  members: Member[];
  currentUser: { id: string } | null;
  expense?: Expense | null;
}

/**
 * 支出表單的狀態與計算（自 701 行的 ExpenseFormDialog 抽出，UI/UX 重設計 Phase 4）。
 * 分帳計算委派給純函式 lib/expenseSplit（有單元測試）：輸入為原幣，
 * 儲存時換算成 TWD 寫入 Expense.splits[].shareAmount。
 */
export function useExpenseForm({ mode, open, members, currentUser, expense }: UseExpenseFormArgs) {
  const tExpense = useTranslations('expense');
  const tCommon = useTranslations('common');

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
  const [splitState, setSplitState] = useState<SplitState>({});
  // 進階欄位（付款人／日期／分帳／行程日／標籤／匯率／收據）預設收合，
  // 讓「金額 → 描述 → 送出」三步完成；編輯模式預設展開。
  const [showAdvanced, setShowAdvanced] = useState(mode === 'edit');
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  const [itineraryDayIds, setItineraryDayIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // Exchange rate states
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState('');

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
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟表單時帶入支出資料，為刻意的同步
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

        const initialSplits: SplitState = {};
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
        // Add mode: Initialize with defaults（今天、TWD、平分全員）
        setForm({
          payer_id: currentUser?.id || members[0]?.id || '',
          original_amount: '',
          currency: 'TWD',
          exchange_rate: '1.0',
          description: '',
          category: DEFAULT_CATEGORY,
          date: new Date().toISOString().split('T')[0],
        });

        setSplitMode('equal');
        const initialSplits: SplitState = {};
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

  const buildSubmitData = (): ExpenseFormData | null => {
    const finalSplits = members
      .filter((m) => splitState[m.id]?.selected)
      .map((m) => ({
        user_id: m.id,
        share_amount: split.twd[m.id], // converted TWD share
      }));

    if (finalSplits.length === 0) {
      setError(tExpense('error.noMembersSelected'));
      return null;
    }

    return {
      ...form,
      splits: finalSplits,
      attachments,
      itinerary_day_ids: itineraryDayIds,
      tags,
    };
  };

  // Switching split mode clears per-member inputs (a value means different
  // things across modes) but keeps who's selected. ToggleGroup emits '' when
  // the active item is re-clicked — ignore that so a mode stays chosen.
  const handleModeChange = (next: string) => {
    if (!next) return;
    setSplitMode(next as SplitMode);
    setSplitState((prev) => {
      const cleared: SplitState = {};
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
    const newState: SplitState = {};
    members.forEach((m) => {
      newState[m.id] = { selected: !allSelected, value: '' };
    });
    setSplitState(newState);
  };

  // 關聯行程日可複選：勾選加入、取消移除。多天時金額於每日花費平均分攤（見 lib/tripStats）。
  const handleItineraryDayToggle = (dayId: string) => {
    setItineraryDayIds((prev) =>
      prev.includes(dayId) ? prev.filter((id) => id !== dayId) : [...prev, dayId]
    );
  };

  return {
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
  };
}
