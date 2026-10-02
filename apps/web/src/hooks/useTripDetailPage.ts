import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { combineReadStates } from '@/lib/queryReadState';
import { useCallback, useMemo, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { Expense, ItineraryDay } from '@/types';
import { EMPTY_EXPENSE_FILTERS, type ExpenseFilters } from '@/lib/expenseFilters';
import { useDialog } from '@/hooks/useDialog';
import { useToast } from '@/hooks/use-toast';
import type { ExpenseFormData } from '@/components/trips/detail/expense-form';
import {
  useTrip,
  useExpenses,
  useItinerary,
  useTripMembership,
  useExpenseMutations,
} from '@/hooks/queries';
import { getCorrectionTiming, trackProductEvent } from '@/lib/productEvents';

const EMPTY_ITINERARY: ItineraryDay[] = [];

/**
 * Controller hook for the trip expenses tab (trips/[id]/expenses/page.tsx).
 *
 * Owns the tab's data loading, edit/delete dialog state, filter state and the
 * action handlers. The add-expense flow and budget dialog moved up to the
 * trip-space shell (useTripSpace) so they are reachable from every tab; the
 * trip-info card and its edit dialog live on the itinerary tab (useEditTrip).
 */
export function useTripDetailPage(tripId: string) {
  const online = useOnlineStatus();
  const tExpense = useTranslations('expense');
  const tError = useTranslations('error');
  const tCommon = useTranslations('common');
  const tOffline = useTranslations('offline');

  const { toast } = useToast();

  // --- Data ---
  const tripQuery = useTrip(tripId);
  const { data: trip, isLoading: tripLoading, isError } = tripQuery;
  const expensesQuery = useExpenses(tripId);
  const { data: expenses = [] } = expensesQuery;
  // 行程日供支出表單「關聯行程日」下拉與支出卡的 Day 標籤使用（React Query 快取，與行程頁共用）。
  const itineraryQuery = useItinerary(tripId);
  const { data: itineraryDays = EMPTY_ITINERARY } = itineraryQuery;
  const membership = useTripMembership(tripId);
  const { currentUser, members, isMember, isAdmin } = membership;
  const query = combineReadStates([tripQuery, expensesQuery]);
  const formQuery = combineReadStates([membership.query, itineraryQuery]);
  const formReady = formQuery.data !== undefined && (!online || !formQuery.isError) && isMember;

  const expenseMutations = useExpenseMutations(tripId);

  const loading = tripLoading;
  const error = isError && !trip ? tError('loadTripFailed') : '';

  // --- Dialog state ---
  const editExpenseDialog = useDialog<Expense>();
  const deleteExpenseDialog = useDialog<Expense>();

  // --- Filter state ---
  const [filters, setFilters] = useState<ExpenseFilters>(EMPTY_EXPENSE_FILTERS);

  // 本 trip 內已用過的標籤（供編輯支出表單的標籤自動完成建議）。
  const existingTags = useMemo(
    () => [...new Set(expenses.flatMap((e) => e.tags))].sort(),
    [expenses]
  );

  const toastError = (err: unknown) => {
    toast({
      variant: 'destructive',
      title: tCommon('errorTitle'),
      description: err instanceof Error ? err.message : String(err),
    });
  };

  // --- Handlers ---
  // Edit/delete stay online-only — guard so they don't hang while paused offline.
  const handleEditExpense = async (data: ExpenseFormData) => {
    const editingExpense = editExpenseDialog.data;
    if (!editingExpense) return;

    if (!onlineManager.isOnline()) {
      toast({
        variant: 'destructive',
        title: tOffline('writeUnavailableTitle'),
        description: tOffline('writeUnavailableMessage'),
      });
      return;
    }

    await expenseMutations.update.mutateAsync({
      expenseId: editingExpense.id,
      input: {
        payer_id: data.payer_id,
        original_amount: parseFloat(data.original_amount),
        currency: data.currency,
        exchange_rate: parseFloat(data.exchange_rate),
        description: data.description.trim(),
        category: data.category,
        date: data.date,
        splits: data.splits,
        attachments: data.attachments,
        itinerary_day_ids: data.itinerary_day_ids,
        tags: data.tags,
      },
    });

    trackProductEvent('expense_correction', {
      action: 'edited',
      timing: getCorrectionTiming(editingExpense.created_at),
    });
    editExpenseDialog.closeDialog();
    toast({
      title: tExpense('success.updated'),
    });
  };

  const openDeleteExpense = deleteExpenseDialog.openDialog;
  const handleDeleteExpense = useCallback(
    (expenseId: string) => {
      const expense = expenses.find((item) => item.id === expenseId);
      if (expense) openDeleteExpense(expense);
    },
    [expenses, openDeleteExpense]
  );

  const confirmDeleteExpense = async () => {
    const deletingExpense = deleteExpenseDialog.data;
    if (!deletingExpense) return;

    if (!onlineManager.isOnline()) {
      deleteExpenseDialog.closeDialog();
      toast({
        variant: 'destructive',
        title: tOffline('writeUnavailableTitle'),
        description: tOffline('writeUnavailableMessage'),
      });
      return;
    }

    try {
      await expenseMutations.remove.mutateAsync(deletingExpense.id);
      trackProductEvent('expense_correction', {
        action: 'deleted',
        timing: getCorrectionTiming(deletingExpense.created_at),
      });
      deleteExpenseDialog.closeDialog();
      toast({
        title: tCommon('deleted'),
        description: tExpense('success.deleted'),
      });
    } catch (err: unknown) {
      toastError(err);
    }
  };

  return {
    query,
    formQuery,
    formReady,
    // data
    trip,
    expenses,
    members,
    itineraryDays,
    existingTags,
    currentUser,
    isMember: !!isMember,
    isAdmin: !!isAdmin,
    // status
    loading,
    error,
    // dialogs
    editExpenseDialog,
    deleteExpenseDialog,
    isDeletingExpense: expenseMutations.remove.isPending,
    // filter
    filters,
    setFilters,
    // handlers
    handleEditExpense,
    handleDeleteExpense,
    confirmDeleteExpense,
  };
}
