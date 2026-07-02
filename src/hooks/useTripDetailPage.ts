import { useMemo, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { Expense } from '@/types';
import { EMPTY_EXPENSE_FILTERS, type ExpenseFilters } from '@/lib/expenseFilters';
import { useDialog } from '@/hooks/useDialog';
import { useToast } from '@/hooks/use-toast';
import type { EditTripFormData } from '@/components/trips/detail/dialogs';
import type { ExpenseFormData } from '@/components/trips/detail/expense-form';
import {
  useTrip,
  useExpenses,
  useItinerary,
  useTripMembership,
  useExpenseMutations,
  useTripMutations,
} from '@/hooks/queries';

/**
 * Controller hook for the trip expenses tab (trips/[id]/page.tsx).
 *
 * Owns the tab's data loading, edit/delete dialog state, filter state and the
 * action handlers. The add-expense flow and budget dialog moved up to the
 * trip-space shell (useTripSpace) so they are reachable from every tab.
 */
export function useTripDetailPage(tripId: string) {
  const tExpense = useTranslations('expense');
  const tTrip = useTranslations('trip');
  const tError = useTranslations('error');
  const tCommon = useTranslations('common');
  const tOffline = useTranslations('offline');

  const { toast } = useToast();

  // --- Data ---
  const { data: trip, isLoading: tripLoading, isError } = useTrip(tripId);
  const { data: expenses = [] } = useExpenses(tripId);
  // 行程日供支出表單「關聯行程日」下拉與支出卡的 Day 標籤使用（React Query 快取，與行程頁共用）。
  const { data: itineraryDays = [] } = useItinerary(tripId);
  const { currentUser, members, isMember, isAdmin } = useTripMembership(tripId);

  const expenseMutations = useExpenseMutations(tripId);
  const tripMutations = useTripMutations(tripId);

  const loading = tripLoading;
  const error = isError ? tError('loadTripFailed') : '';

  // --- Dialog state ---
  const editExpenseDialog = useDialog<Expense>();
  const deleteExpenseDialog = useDialog<string>();
  const editTripDialog = useDialog();

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

    editExpenseDialog.closeDialog();
    toast({
      title: tExpense('success.updated'),
    });
  };

  const handleDeleteExpense = (expenseId: string) => {
    deleteExpenseDialog.openDialog(expenseId);
  };

  const confirmDeleteExpense = async () => {
    const expenseId = deleteExpenseDialog.data;
    if (!expenseId) return;

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
      await expenseMutations.remove.mutateAsync(expenseId);
      deleteExpenseDialog.closeDialog();
      toast({
        title: tCommon('deleted'),
        description: tExpense('success.deleted'),
      });
    } catch (err: unknown) {
      toastError(err);
    }
  };

  const handleEditTrip = async (data: EditTripFormData) => {
    await tripMutations.update.mutateAsync({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      departure_location: data.departure_location || null,
      destination_location: data.destination_location || null,
    });

    editTripDialog.closeDialog();
    toast({
      title: tTrip('editSuccess'),
    });
  };

  return {
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
    editTripDialog,
    isDeletingExpense: expenseMutations.remove.isPending,
    // filter
    filters,
    setFilters,
    // handlers
    handleEditExpense,
    handleDeleteExpense,
    confirmDeleteExpense,
    handleEditTrip,
  };
}
