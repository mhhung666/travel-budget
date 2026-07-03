import { useMemo } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { SetBudgetInput } from '@/lib/validation';
import { computeBudgetProgress } from '@/lib/budget';
import { useDialog } from '@/hooks/useDialog';
import { useToast } from '@/hooks/use-toast';
import type { ExpenseFormData } from '@/components/trips/detail/expense-form';
import type { AddExpensePrefill } from '@/components/trips/space/TripSpaceContext';
import {
  useTrip,
  useExpenses,
  useItinerary,
  useTripMembership,
  useExpenseMutations,
  useTripMutations,
} from '@/hooks/queries';

/**
 * Controller hook for the trip-space shell (trips/[id]/layout.tsx).
 *
 * The shell owns the cross-tab pieces of the trip space: the persistent
 * budget/total summary bar, the always-available "add expense" flow (FAB on
 * mobile, toolbar button on the expenses tab) and the budget dialog reached
 * from the "more" menu. Everything here reads from the same React Query cache
 * as the tab pages, so mounting the shell adds no extra requests.
 */
export function useTripSpace(tripId: string) {
  const tExpense = useTranslations('expense');
  const tBudget = useTranslations('budget');
  const tCommon = useTranslations('common');
  const tOffline = useTranslations('offline');

  const { toast } = useToast();

  const { data: trip, isLoading } = useTrip(tripId);
  const { data: expenses = [] } = useExpenses(tripId);
  const { data: itineraryDays = [] } = useItinerary(tripId);
  const { currentUser, members, isMember, isAdmin } = useTripMembership(tripId);

  const expenseMutations = useExpenseMutations(tripId);
  const tripMutations = useTripMutations(tripId);

  // 新增支出可帶預填（如清單購物項的品名）；dialog.data 存這份 prefill。
  const addExpenseDialog = useDialog<AddExpensePrefill>();
  const budgetDialog = useDialog();

  // 常駐摘要條：總支出（＋已設定時的預算進度），由已載入的 trip + expenses 即時計算。
  const budgetProgress = useMemo(
    () => computeBudgetProgress(trip?.budget ?? null, expenses),
    [trip?.budget, expenses]
  );

  // 本 trip 內已用過的標籤（供支出表單的標籤自動完成建議）。
  const existingTags = useMemo(
    () => [...new Set(expenses.flatMap((e) => e.tags))].sort(),
    [expenses]
  );

  // Offline-capable: fire-and-forget so the dialog closes immediately. The
  // optimistic insert (mutation onMutate) shows the row at once; when offline
  // the mutation pauses and replays on reconnect (ROADMAP #5 Phase 2).
  const handleAddExpense = async (data: ExpenseFormData) => {
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
          tags: data.tags,
        },
      },
      {
        onError: (err) =>
          toast({
            variant: 'destructive',
            title: tCommon('errorTitle'),
            description: err instanceof Error ? err.message : String(err),
          }),
      }
    );

    addExpenseDialog.closeDialog();
    toast(
      online
        ? { title: tExpense('success.added'), description: tExpense('success.addedMessage') }
        : { title: tOffline('queuedTitle'), description: tOffline('queuedMessage') }
    );
  };

  const handleSetBudget = async (input: SetBudgetInput) => {
    await tripMutations.setBudget.mutateAsync(input);
    budgetDialog.closeDialog();
    toast({
      title: tBudget('success'),
    });
  };

  return {
    trip,
    isLoading,
    members,
    currentUser,
    isMember: !!isMember,
    isAdmin: !!isAdmin,
    itineraryDays,
    existingTags,
    budgetProgress,
    addExpenseDialog,
    budgetDialog,
    handleAddExpense,
    handleSetBudget,
  };
}
