'use client';

import { useTranslations } from 'next-intl';
import { Member } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ToggleAdminDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  member: Member | null;
}

export default function ToggleAdminDialog({
  open,
  onClose,
  onConfirm,
  member,
}: ToggleAdminDialogProps) {
  const tCommon = useTranslations('common');
  const tMember = useTranslations('member');

  const isPromoting = member?.role !== 'admin';

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isPromoting ? tMember('promoteToAdmin') : tMember('demoteFromAdmin')}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <p>
            {isPromoting ? tMember('confirm.promoteToAdmin') : tMember('confirm.demoteFromAdmin')}
          </p>
          {isPromoting && (
            <p className="text-sm text-muted-foreground">{tMember('confirm.promoteMessage')}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={onConfirm} variant={isPromoting ? 'default' : 'destructive'}>
            {tCommon('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
