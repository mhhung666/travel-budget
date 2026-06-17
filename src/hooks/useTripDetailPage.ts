import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Expense } from '@/types';
import { useDialog } from '@/hooks/useDialog';
import { useToast } from '@/hooks/use-toast';
import type {
  ExpenseDialogData,
  EditTripFormData,
} from '@/components/trips/detail/dialogs';
import {
  useTrip,
  useExpenses,
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
  const tError = useTranslations('error');

  const { toast } = useToast();

  // --- Data ---
  const { data: trip, isLoading: tripLoading, isError } = useTrip(tripId);
  const { data: expenses = [] } = useExpenses(tripId);
  const { currentUser, members, isMember, isAdmin } = useTripMembership(tripId);

  const expenseMutations = useExpenseMutations(tripId);
  const tripMutations = useTripMutations(tripId);

  const loading = tripLoading;
  const error = isError ? tError('loadTripFailed') : '';

  // --- Dialog state ---
  const addExpenseDialog = useDialog();
  const editExpenseDialog = useDialog<Expense>();
  const editTripDialog = useDialog();

  // --- Filter & expand state ---
  const [filterMemberId, setFilterMemberId] = useState<string | 'all'>('all');
  const [expensesExpanded, setExpensesExpanded] = useState(true);

  const toastError = (err: unknown) => {
    toast({
      variant: 'destructive',
      title: 'Error',
      description: err instanceof Error ? err.message : String(err),
    });
  };

  // --- Handlers ---
  const handleAddExpense = async (data: ExpenseDialogData) => {
    await expenseMutations.create.mutateAsync({
      payer_id: data.payer_id,
      original_amount: parseFloat(data.original_amount),
      currency: data.currency,
      exchange_rate: parseFloat(data.exchange_rate),
      description: data.description,
      category: data.category,
      date: data.date,
      splits: data.splits,
    });

    addExpenseDialog.closeDialog();
    toast({
      title: tExpense('success.added'),
      description: tExpense('success.addedMessage'),
    });
  };

  const handleEditExpense = async (data: ExpenseDialogData) => {
    const editingExpense = editExpenseDialog.data;
    if (!editingExpense) return;

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
      },
    });

    editExpenseDialog.closeDialog();
    toast({
      title: tExpense('success.updated'),
    });
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm(tExpense('confirm.delete'))) return;

    try {
      await expenseMutations.remove.mutateAsync(expenseId);
      toast({
        title: 'Deleted',
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
      location: data.location || null,
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
    currentUser,
    isMember: !!isMember,
    isAdmin: !!isAdmin,
    // status
    loading,
    error,
    // dialogs
    addExpenseDialog,
    editExpenseDialog,
    editTripDialog,
    // filter & expand
    filterMemberId,
    setFilterMemberId,
    expensesExpanded,
    toggleExpensesExpanded: () => setExpensesExpanded((v) => !v),
    // handlers
    handleAddExpense,
    handleEditExpense,
    handleDeleteExpense,
    handleEditTrip,
  };
}
