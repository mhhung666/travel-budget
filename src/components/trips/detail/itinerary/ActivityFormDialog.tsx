'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActivityPayload } from '@/hooks/queries/useItineraryMutations';
import {
  ActivityCard,
  type ActivityDraft,
  draftsToPayload,
  makeEmptyActivity,
} from './ActivityListEditor';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ActivityFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** 送出單一活動 payload；由父層併入該天既有活動後呼叫 updateItineraryDay。 */
  onSubmit: (activity: ActivityPayload) => Promise<void>;
  tripId: string;
  /** 對話框標題顯示「第 N 天」；可省略。 */
  dayNumber?: number;
}

/**
 * 手機友善的「新增單一活動」對話框：只顯示一張活動卡（不含整天的標題/地點/Markdown/
 * 活動清單）。送出時把這一筆併入該天既有活動。需要 5 個欄位以外的整天編輯時才走
 * ItineraryDayDialog。
 */
export default function ActivityFormDialog({
  open,
  onClose,
  onSubmit,
  tripId,
  dayNumber,
}: ActivityFormDialogProps) {
  const t = useTranslations('itinerary.activities');
  const tCommon = useTranslations('common');

  const [draft, setDraft] = useState<ActivityDraft>(makeEmptyActivity());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時重置為空白卡，刻意的同步
    if (open) setDraft(makeEmptyActivity());
  }, [open]);

  const handleSubmit = async () => {
    const [payload] = draftsToPayload([draft]); // 沒填標題會被濾掉 → undefined
    if (!payload) return;
    setLoading(true);
    try {
      await onSubmit(payload);
      onClose();
    } catch {
      // 由父層處理錯誤 toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{dayNumber ? t('addToDay', { dayNumber }) : t('add')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-1">
          <ActivityCard
            tripId={tripId}
            activity={draft}
            onChange={(fields) => setDraft((prev) => ({ ...prev, ...fields }))}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            {tCommon('cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={loading || !draft.title.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
