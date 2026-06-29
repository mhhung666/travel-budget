import { useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { Expense } from '@/types';
import type { SetBudgetInput } from '@/lib/validation';
import { EMPTY_EXPENSE_FILTERS, type ExpenseFilters } from '@/lib/expenseFilters';
import { useDialog } from '@/hooks/useDialog';
import { useToast } from '@/hooks/use-toast';
import type { ExpenseDialogData, EditTripFormData } from '@/components/trips/detail/dialogs';
import {
  useTrip,
  useExpenses,
  useItinerary,
  useTripMembership,
  useExpenseMutations,
  useTripMutations,
} from '@/hooks/queries';

/**
 * Controller hook for the trip detail page.
 *
 * Owns the page's data loading, dialog state, filter/expand UI state and the
 * action handlers, so the page component itself only wires the returned values
 * into presentational components (see IMPROVEMENTS.md #8 — page over-responsibility).
 */
export function useTripDetailPage(tripId: string) {
  const tExpense = useTranslations('expense');
  const tTrip = useTranslations('trip');
  const tBudget = useTranslations('budget');
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
  const addExpenseDialog = useDialog();
  const editExpenseDialog = useDialog<Expense>();
  const deleteExpenseDialog = useDialog<string>();
  const editTripDialog = useDialog();
  const budgetDialog = useDialog();

  // --- Filter & expand state ---
  const [filters, setFilters] = useState<ExpenseFilters>(EMPTY_EXPENSE_FILTERS);
  const [expensesExpanded, setExpensesExpanded] = useState(true);

  const toastError = (err: unknown) => {
    toast({
      variant: 'destructive',
      title: tCommon('errorTitle'),
      description: err instanceof Error ? err.message : String(err),
    });
  };

  // --- Handlers ---
  // Offline-capable: fire-and-forget so the dialog closes immediately. The
  // optimistic insert (mutation onMutate) shows the row at once; when offline
  // the mutation pauses and replays on reconnect (ROADMAP #5 Phase 2).
  const handleAddExpense = async (data: ExpenseDialogData) => {
    const online = onlineManager.isOnline();
    expenseMutations.create.mutate(
      {
        tripId,
        input: {
          payer_id: data.payer_id,
          original_amount: parseFloat(data.original_amount),
          currency: data.currency,
          exchange_rate: parseFloat(data.exchange_rate),
          description: data.description,
          category: data.category,
          date: data.date,
          splits: data.splits,
          attachments: data.attachments,
          itinerary_day_ids: data.itinerary_day_ids,
        },
      },
      { onError: toastError }
    );

    addExpenseDialog.closeDialog();
    toast(
      online
        ? { title: tExpense('success.added'), description: tExpense('success.addedMessage') }
        : { title: tOffline('queuedTitle'), description: tOffline('queuedMessage') }
    );
  };

  // Edit/delete stay online-only — guard so they don't hang while paused offline.
  const handleEditExpense = async (data: ExpenseDialogData) => {
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

  const handleSetBudget = async (input: SetBudgetInput) => {
    await tripMutations.setBudget.mutateAsync(input);
    budgetDialog.closeDialog();
    toast({
      title: tBudget('success'),
    });
  };

  return {
    // data
    trip,
    expenses,
    members,
    itineraryDays,
    currentUser,
    isMember: !!isMember,
    isAdmin: !!isAdmin,
    // status
    loading,
    error,
    // dialogs
    addExpenseDialog,
    editExpenseDialog,
    deleteExpenseDialog,
    editTripDialog,
    budgetDialog,
    isDeletingExpense: expenseMutations.remove.isPending,
    // filter & expand
    filters,
    setFilters,
    expensesExpanded,
    toggleExpensesExpanded: () => setExpensesExpanded((v) => !v),
    // handlers
    handleAddExpense,
    handleEditExpense,
    handleDeleteExpense,
    confirmDeleteExpense,
    handleEditTrip,
    handleSetBudget,
  };
}
