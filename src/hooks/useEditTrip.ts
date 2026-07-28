import { useTranslations } from 'next-intl';
import { useDialog } from '@/hooks/useDialog';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations } from '@/hooks/queries';
import type { EditTripFormData } from '@/components/trips/detail/dialogs';

/**
 * 「編輯行程資訊」對話框狀態 + 送出（行程資訊卡的編輯鍵用）。
 * 行程資訊卡住在行程分頁，但支出分頁的 controller 也曾持有這段，抽出來共用。
 */
export function useEditTrip(tripId: string) {
  const tTrip = useTranslations('trip');
  const { toast } = useToast();
  const { update } = useTripMutations(tripId);
  const editTripDialog = useDialog();

  const handleEditTrip = async (data: EditTripFormData) => {
    await update.mutateAsync({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      destination_location: data.destination_location || null,
    });

    editTripDialog.closeDialog();
    toast({ title: tTrip('editSuccess') });
  };

  return { editTripDialog, handleEditTrip };
}
