'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DEFAULT_CATEGORY } from '@/constants/categories';
import { computeSplits, reconstructOriginalShares, type SplitMode } from '@/lib/expenseSplit';
import {
  clearExpenseDraft,
  loadExpenseDraft,
  saveExpenseDraft,
  serializeExpenseDraft,
  type ExpenseDraftSnapshot,
} from '@/lib/expenseDraftStorage';
import { getPinnedRate, getTripDefaultCurrency } from '@/lib/tripCurrency';
import { toDateInputValue, toLocalDateInputValue } from '@/lib/dateInput';
import type { Expense, ExpenseAttachment, Member, TripCurrencySettings } from '@/types';
import type { NormalizedExpenseTextDraft } from '@/lib/ai/normalizeExpenseTextDraft';
import type { ReceiptDraft } from '@/lib/ai/receiptDraftSchema';

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
  /** 草稿以旅行為單位各存一份；新增模式才會寫入。 */
  tripId: string;
  open: boolean;
  members: Member[];
  currentUser: { id: string } | null;
  expense?: Expense | null;
  /** 新增模式的預填描述（如清單購物項品名）；編輯模式忽略。 */
  initialDescription?: string;
  /** 旅程幣別設定（預設幣別／自訂匯率）；null/未傳 = 未設定（預設 TWD、即時匯率）。 */
  currencySettings?: TripCurrencySettings | null;
}

/**
 * 把存下來的草稿對齊目前成員：離開期間成員可能被移除或新增。
 * 草稿裡完全沒有目前任何成員（例如換了旅行成員名單）時視為無法使用，回 null 走預設值。
 */
function alignDraft(
  draft: ExpenseDraftSnapshot | null,
  members: Member[],
  defaults: ExpenseDraftSnapshot
): ExpenseDraftSnapshot | null {
  if (!draft) return null;
  const known = members.filter((m) => draft.splitState[m.id]);
  if (known.length === 0) return null;

  const splitState: SplitState = {};
  members.forEach((m) => {
    splitState[m.id] = draft.splitState[m.id] ?? { selected: false, value: '' };
  });
  const payerExists = members.some((m) => m.id === draft.form.payer_id);

  return {
    ...draft,
    form: {
      ...draft.form,
      payer_id: payerExists ? draft.form.payer_id : defaults.form.payer_id,
    },
    splitState,
  };
}

/**
 * 支出表單的狀態與計算（自 701 行的 ExpenseFormDialog 抽出，UI/UX 重設計 Phase 4）。
 * 分帳計算委派給純函式 lib/expenseSplit（有單元測試）：輸入為原幣，
 * 儲存時換算成 TWD 寫入 Expense.splits[].shareAmount。
 */
export function useExpenseForm({
  mode,
  tripId,
  open,
  members,
  currentUser,
  expense,
  initialDescription,
  currencySettings,
}: UseExpenseFormArgs) {
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
    date: toLocalDateInputValue(),
  });

  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [splitState, setSplitState] = useState<SplitState>({});
  // 付款人／日期直接露出；分帳明細與「更多設定」（行程日／標籤／匯率／收據）預設收合，
  // 讓「金額 → 描述 → 送出」三步完成，改分帳只需展開一層。
  const [showSplit, setShowSplit] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  const [itineraryDayIds, setItineraryDayIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // 只有「從零開始新增」才留草稿：編輯既有支出、或從離線草稿修補（expense 有值）都不寫入，
  // 免得本機內容和伺服器上的支出各說各話。
  const draftTripId = mode === 'add' && !expense ? tripId : null;
  const [draftRestored, setDraftRestored] = useState(false);
  // 開啟當下的「原始內容」，用來判斷使用者有沒有改過（新增＝預設值，編輯＝該筆支出）。
  const baselineRef = useRef<ExpenseDraftSnapshot | null>(null);

  // Exchange rate states
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState('');

  const fetchExchangeRates = async (): Promise<Record<string, number> | null> => {
    setLoadingRates(true);
    setRatesError('');
    try {
      const response = await fetch('/api/exchange-rates');
      const data = await response.json();

      if (data.success) {
        setExchangeRates(data.rates);
        return data.rates;
      }
      setRatesError(tExpense('error.ratesLoadFailed'));
      if (data.rates) {
        setExchangeRates(data.rates);
        return data.rates;
      }
      return null;
    } catch {
      setRatesError(tExpense('error.ratesLoadFailed'));
      return null;
    } finally {
      setLoadingRates(false);
    }
  };

  // 新增模式的預設內容（今天、旅程預設幣別、平分全員）；草稿比對與「捨棄草稿」都以它為基準。
  const buildAddDefaults = useCallback((): ExpenseDraftSnapshot => {
    const defaultCurrency = getTripDefaultCurrency(currencySettings);
    const pinnedRate = getPinnedRate(currencySettings, defaultCurrency);
    const splitState: SplitState = {};
    members.forEach((m) => {
      splitState[m.id] = { selected: true, value: '' };
    });
    return {
      form: {
        payer_id: currentUser?.id || members[0]?.id || '',
        original_amount: '',
        currency: defaultCurrency,
        exchange_rate:
          defaultCurrency === 'TWD' ? '1.0' : pinnedRate != null ? String(pinnedRate) : '',
        description: initialDescription ?? '',
        category: DEFAULT_CATEGORY,
        date: toLocalDateInputValue(),
      },
      splitMode: 'equal',
      splitState,
      itineraryDayIds: [],
      tags: [],
      attachments: [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currencySettings 同下方 effect：只影響開啟當下的預設值
  }, [members, currentUser, initialDescription]);

  /**
   * 套用一份內容到表單。`expandFilled` 用於帶回草稿：使用者填過的分帳／標籤／行程日
   * 要看得見才能確認；乾淨的預設值則維持收合，保留「金額 → 描述 → 送出」的三步流程。
   */
  const applySnapshot = useCallback((snapshot: ExpenseDraftSnapshot, expandFilled: boolean) => {
    setForm(snapshot.form);
    setSplitMode(snapshot.splitMode);
    setSplitState(snapshot.splitState);
    setAttachments(snapshot.attachments);
    setItineraryDayIds(snapshot.itineraryDayIds);
    setTags(snapshot.tags);
    setShowSplit(expandFilled && snapshot.splitMode !== 'equal');
    setShowAdvanced(
      expandFilled && (snapshot.tags.length > 0 || snapshot.itineraryDayIds.length > 0)
    );
  }, []);

  useEffect(() => {
    if (open) {
      if (expense) {
        // Edit mode: Load existing expense data
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟表單時帶入支出資料，為刻意的同步
        setForm({
          payer_id: expense.payer_id,
          original_amount: expense.original_amount.toString(),
          currency: expense.currency,
          exchange_rate: expense.exchange_rate.toString(),
          description: expense.description,
          category: expense.category || DEFAULT_CATEGORY,
          date: toDateInputValue(expense.date),
        });

        // Reconstruct split inputs from stored TWD shares. We don't persist the
        // split mode, so infer it: shares identical to an even split → 'equal'
        // (blank inputs), otherwise → 'amount' with each member's original amount.
        // 依成員順序排列：回存時 computeSplits 也按成員順序分配尾差。
        const splitMembers = members.filter((m) => expense.splits.some((s) => s.user_id === m.id));
        const { shares: originalShares, equal } = reconstructOriginalShares(
          expense.original_amount,
          splitMembers.map((m) => expense.splits.find((s) => s.user_id === m.id)!.share_amount)
        );
        const inferredMode: SplitMode = equal ? 'equal' : 'amount';
        setSplitMode(inferredMode);

        const initialSplits: SplitState = {};
        members.forEach((m) => {
          const index = splitMembers.indexOf(m);
          if (index >= 0) {
            initialSplits[m.id] = {
              selected: true,
              value: inferredMode === 'equal' ? '' : String(originalShares[index]),
            };
          } else {
            initialSplits[m.id] = { selected: false, value: '' };
          }
        });
        setSplitState(initialSplits);
        setAttachments(expense.attachments ?? []);
        setItineraryDayIds(expense.itinerary_day_ids ?? []);
        setTags(expense.tags ?? []);
        // 既有支出：非均分才展開分帳；有填過更多設定的內容才展開，避免編輯時表單又拉長。
        setShowSplit(inferredMode !== 'equal');
        setShowAdvanced(
          expense.currency !== 'TWD' ||
            (expense.tags?.length ?? 0) > 0 ||
            (expense.itinerary_day_ids?.length ?? 0) > 0 ||
            (mode === 'edit' && (expense.attachments?.length ?? 0) > 0)
        );
        // 關閉時要能分辨「沒動過」和「改到一半」，因此記下帶入當下的內容。
        baselineRef.current = {
          form: {
            payer_id: expense.payer_id,
            original_amount: expense.original_amount.toString(),
            currency: expense.currency,
            exchange_rate: expense.exchange_rate.toString(),
            description: expense.description,
            category: expense.category || DEFAULT_CATEGORY,
            date: toDateInputValue(expense.date),
          },
          splitMode: inferredMode,
          splitState: initialSplits,
          itineraryDayIds: expense.itinerary_day_ids ?? [],
          tags: expense.tags ?? [],
          attachments: expense.attachments ?? [],
        };
        setDraftRestored(false);
      } else {
        // Add mode: Initialize with defaults（今天、旅程預設幣別（未設定則 TWD）、平分全員）；
        // 描述可由呼叫端預填（如清單購物項的品名，「勾完→記一筆」）。
        // 匯率預填順序：旅程自訂匯率 → 即時匯率（fetch 回來後補）→ 1.0。
        const defaults = buildAddDefaults();
        baselineRef.current = defaults;
        // 上次未完成的內容優先帶回；成員可能已異動，分帳狀態要對齊目前成員。
        const draft = draftTripId
          ? alignDraft(loadExpenseDraft(draftTripId), members, defaults)
          : null;
        applySnapshot(draft ?? defaults, draft != null);
        setDraftRestored(draft != null);
      }

      setError('');
      // 新增模式且預設幣別是外幣又沒自訂匯率時，即時匯率回來後補進表單；
      // 只在匯率仍為空值（使用者沒動過）時補，避免蓋掉手動輸入。
      fetchExchangeRates().then((rates) => {
        if (mode !== 'add' || !rates) return;
        const defaultCurrency = getTripDefaultCurrency(currencySettings);
        if (defaultCurrency === 'TWD') return;
        if (getPinnedRate(currencySettings, defaultCurrency) != null) return;
        const live = rates[defaultCurrency];
        if (!live) return;
        setForm((prev) =>
          prev.currency === defaultCurrency && prev.exchange_rate === ''
            ? { ...prev, exchange_rate: live.toFixed(6) }
            : prev
        );
        // 自動補上的匯率不是使用者的輸入，基準值同步跟上，否則空白表單會被當成「改過」。
        const baseline = baselineRef.current;
        if (baseline?.form.currency === defaultCurrency && baseline.form.exchange_rate === '') {
          baselineRef.current = {
            ...baseline,
            form: { ...baseline.form, exchange_rate: live.toFixed(6) },
          };
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currencySettings 只影響開啟當下的預設值，開著時變動不重置表單
  }, [open, mode, expense, members, currentUser, initialDescription]);

  const snapshot: ExpenseDraftSnapshot = {
    form,
    splitMode,
    splitState,
    itineraryDayIds,
    tags,
    attachments,
  };
  const serializedSnapshot = serializeExpenseDraft(snapshot);

  /**
   * 目前內容和開啟當下的原始內容是否不同（函式而非值：基準放在 ref，不在 render 期間讀取）。
   * 尚未帶入初始值（baseline 為 null）時一律當作沒改過，避免開啟瞬間就存下空草稿。
   */
  const isDirty = useCallback(() => {
    const baseline = baselineRef.current;
    return baseline != null && serializedSnapshot !== serializeExpenseDraft(baseline);
  }, [serializedSnapshot]);

  /**
   * 立刻把目前內容寫進草稿（關閉或切換旅行時呼叫，不等 debounce）。
   * 回傳是否真的留下草稿：沒改過或寫入失敗都是 false，呼叫端據此決定要不要提示。
   */
  const persistDraft = useCallback(() => {
    if (!draftTripId) return false;
    if (!isDirty()) {
      clearExpenseDraft(draftTripId);
      return false;
    }
    return saveExpenseDraft(draftTripId, snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot 以序列化結果代表，避免每次 render 都換掉 callback
  }, [draftTripId, isDirty, serializedSnapshot]);

  /** 送出成功或使用者主動捨棄時清掉草稿。 */
  const clearDraft = useCallback(() => {
    if (draftTripId) clearExpenseDraft(draftTripId);
  }, [draftTripId]);

  /** 捨棄帶回的草稿，把表單還原成乾淨的預設值。 */
  const discardDraft = useCallback(() => {
    clearDraft();
    const defaults = buildAddDefaults();
    baselineRef.current = defaults;
    applySnapshot(defaults, false);
    setDraftRestored(false);
    setError('');
  }, [clearDraft, buildAddDefaults, applySnapshot]);

  // 編輯途中也持續存檔，這樣重新整理或分頁被系統回收後草稿仍在；
  // debounce 避免每個按鍵都寫 localStorage。
  useEffect(() => {
    if (!open || !draftTripId) return;
    if (!isDirty()) {
      clearExpenseDraft(draftTripId);
      return;
    }
    const timer = setTimeout(() => saveExpenseDraft(draftTripId, snapshot), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 同上：以序列化結果代表 snapshot
  }, [open, draftTripId, isDirty, serializedSnapshot]);

  const originalAmount = parseFloat(form.original_amount) || 0;
  const hasValidAmount = Number.isFinite(originalAmount) && originalAmount > 0;
  const parsedExchangeRate = Number(form.exchange_rate);
  const hasValidExchangeRate =
    form.currency === 'TWD' || (Number.isFinite(parsedExchangeRate) && parsedExchangeRate > 0);
  const exchangeRate = form.currency === 'TWD' ? 1 : hasValidExchangeRate ? parsedExchangeRate : 0;
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
    if (!hasValidAmount) {
      setError(tExpense('error.amountRequired'));
      return null;
    }

    if (!hasValidExchangeRate) {
      setError(tExpense('error.exchangeRateRequired'));
      return null;
    }

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

  const applyTextDraft = (draft: NormalizedExpenseTextDraft) => {
    setForm((previous) => ({
      ...previous,
      description: draft.description,
      original_amount: String(draft.originalAmount),
      currency: draft.currency ?? previous.currency,
      date: draft.date ?? previous.date,
      category: draft.category ?? previous.category,
      payer_id: draft.payerId ?? previous.payer_id,
    }));
    if (draft.resolvedSplit) {
      const entries = new Map(
        draft.resolvedSplit.entries.map((entry) => [entry.memberId, entry.value])
      );
      setSplitMode(draft.resolvedSplit.mode);
      setSplitState(
        Object.fromEntries(
          members.map((member) => [
            member.id,
            {
              selected: entries.has(member.id),
              value: entries.get(member.id) ?? '',
            },
          ])
        )
      );
    }
    // 付款人已直接露出；分帳與標籤有被草稿改動時才展開對應區塊供確認。
    if (draft.resolvedSplit) setShowSplit(true);
    if (draft.tags) {
      setTags(draft.tags);
      if (draft.tags.length > 0) setShowAdvanced(true);
    }
  };

  /** Applies only fields the receipt parser identified unambiguously. */
  const applyReceiptDraft = (draft: ReceiptDraft) => {
    const totals = draft.amountCandidates.filter((candidate) => candidate.kind === 'total');
    const total = totals[0];
    const canApplyTotal = draft.fieldStatus.total === 'read' && totals.length === 1 && total;
    const canApplyCurrency = draft.fieldStatus.currency === 'read' && draft.currency;
    setForm((previous) => {
      const currency = canApplyCurrency ? draft.currency! : previous.currency;
      const pinnedRate = getPinnedRate(currencySettings, currency);
      const exchangeRate =
        currency === 'TWD'
          ? '1.0'
          : pinnedRate != null
            ? String(pinnedRate)
            : (exchangeRates[currency]?.toFixed(6) ??
              (currency === previous.currency ? previous.exchange_rate : ''));
      return {
        ...previous,
        description:
          draft.fieldStatus.merchantName === 'read' && draft.merchantName
            ? draft.merchantName
            : previous.description,
        original_amount: canApplyTotal ? String(total!.amount) : previous.original_amount,
        currency,
        exchange_rate: exchangeRate,
        date:
          draft.fieldStatus.transactionDate === 'read' && draft.transactionDate
            ? draft.transactionDate
            : previous.date,
        category: draft.suggestedCategory ?? previous.category,
      };
    });
    return draft.warnings.length > 0 || !canApplyTotal || !canApplyCurrency;
  };

  return {
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
    draftEnabled: draftTripId != null,
    draftRestored,
    persistDraft,
    clearDraft,
    discardDraft,
  };
}
