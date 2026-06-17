'use client';

import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface RegenerateShareCodeDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isRegenerating?: boolean;
}

export default function RegenerateShareCodeDialog({
  open,
  onClose,
  onConfirm,
  isRegenerating = false,
}: RegenerateShareCodeDialogProps) {
  const tCommon = useTranslations('common');
  const tTrip = useTranslations('trip');

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{tTrip('regenerateShareConfirmTitle')}</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <p className="text-sm text-muted-foreground">{tTrip('regenerateShareConfirmDesc')}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isRegenerating}>
            {tCommon('cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isRegenerating}>
            {tCommon('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
