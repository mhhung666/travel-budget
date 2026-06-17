'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DeleteTripDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  tripName?: string;
  isDeleting: boolean;
}

export default function DeleteTripDialog({
  open,
  onClose,
  onConfirm,
  tripName,
  isDeleting,
}: DeleteTripDialogProps) {
  const tTrip = useTranslations('trip');
  const tCommon = useTranslations('common');

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{tTrip('deleteConfirmTitle')}</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <Alert
            variant="destructive"
            className="bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900"
          >
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertTitle className="text-red-800 dark:text-red-300">Warning</AlertTitle>
            <AlertDescription className="text-red-700 dark:text-red-400">
              {tTrip('deleteConfirmWarning')}
            </AlertDescription>
          </Alert>

          <p>{tTrip('deleteConfirmMessage', { name: tripName || '' })}</p>
          <p className="text-sm text-muted-foreground">{tTrip('deleteConfirmDetails')}</p>
          <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
            <li>{tTrip('deleteItem1')}</li>
            <li>{tTrip('deleteItem2')}</li>
            <li>{tTrip('deleteItem3')}</li>
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            {tCommon('cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {isDeleting ? tTrip('deleting') : tTrip('confirmDelete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
