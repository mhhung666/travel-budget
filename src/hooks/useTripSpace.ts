import { onlineManager } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { SetBudgetInput } from '@/lib/validation';
import { useDialog } from '@/hooks/useDialog';
import { useToast } from '@/hooks/use-toast';
import type { ExpenseFormData } from '@/components/trips/detail/expense-form';
import type { AddExpensePrefill } from '@/components/trips/space/TripSpaceContext';
import {
  useTripShell,
  useCurrentUser,
  useMembers,
  useExpenseTags,
  useItinerary,
  useExpenseMutations,
  useTripMutations,
} from '@/hooks/queries';

/**
 * Controller hook for the trip-space shell (trips/[id]/layout.tsx).
 *
 * The shell owns the cross-tab pieces of the trip space: the persistent
 * budget/total summary bar, the always-available "add expense" flow (FAB on
 * mobile, toolbar button on the expenses tab) and the budget dialog reached
 * from the "more" menu. The always-mounted path only reads the compact shell
 * DTO; form-specific member/day/tag data is enabled after the form opens.
 */
export function useTripSpace(tripId: string, loadExpenseForm = false) {
  const tExpense = useTranslations('expense');
  const tBudget = useTranslations('budget');
  const tCommon = useTranslations('common');
  const tOffline = useTranslations('offline');

  const { toast } = useToast();

  // 新增支出可帶預填（如清單購物項的品名）；dialog.data 存這份 prefill。
  const addExpenseDialog = useDialog<AddExpensePrefill>();
  const budgetDialog = useDialog();

  const { data: shell, isLoading } = useTripShell(tripId);
  const isMember = shell?.role != null;
  const shouldLoadForm = (loadExpenseForm || addExpenseDialog.open) && isMember;
  const { data: currentUser = null, isLoading: isCurrentUserLoading } =
    useCurrentUser(shouldLoadForm);
  const { data: members = [], isLoading: areMembersLoading } = useMembers(tripId, shouldLoadForm);
  const { data: itineraryDays = [], isLoading: isItineraryLoading } = useItinerary(
    tripId,
    shouldLoadForm
  );
  const { data: existingTags = [], isLoading: areTagsLoading } = useExpenseTags(
    tripId,
    shouldLoadForm
  );

  const expenseMutations = useExpenseMutations(tripId);
  const tripMutations = useTripMutations(tripId);

  // 常駐摘要條：登入者的分攤支出（＋已設定時的個人預算進度）。
  const budgetProgress = {
    total: shell?.budget?.total ?? null,
    totalSpent: shell?.total_spent ?? 0,
  };

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
    trip: shell,
    shell,
    isLoading,
    members,
    currentUser,
    isMember,
    isAdmin: shell?.role === 'admin',
    isMembershipLoading:
      shouldLoadForm &&
      (isCurrentUserLoading || areMembersLoading || isItineraryLoading || areTagsLoading),
    itineraryDays,
    existingTags,
    budgetProgress,
    addExpenseDialog,
    budgetDialog,
    handleAddExpense,
    handleSetBudget,
  };
}
