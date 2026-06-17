'use client';

import { AlertTriangle, AlertCircle, Info, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  severity?: 'warning' | 'error' | 'info';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const severityConfig = {
  warning: {
    icon: AlertTriangle,
    variant: 'default' as const, // shadcn doesn't have warning button variant by default, use default or create one
    iconColor: 'text-yellow-500',
  },
  error: {
    icon: AlertCircle,
    variant: 'destructive' as const,
    iconColor: 'text-destructive',
  },
  info: {
    icon: Info,
    variant: 'default' as const,
    iconColor: 'text-blue-500',
  },
};

/**
 * Reusable confirmation dialog component
 *
 * @example
 * const deleteDialog = useDialog();
 *
 * <ConfirmDialog
 *   open={deleteDialog.open}
 *   title="Delete Item"
 *   message="Are you sure you want to delete this item? This action cannot be undone."
 *   severity="error"
 *   confirmText="Delete"
 *   onConfirm={handleDelete}
 *   onCancel={deleteDialog.closeDialog}
 *   loading={isDeleting}
 * />
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  severity = 'warning',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const config = severityConfig[severity];
  const Icon = config.icon;

  const handleOpenChange = (openState: boolean) => {
    if (!openState && !loading) {
      onCancel();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon className={config.iconColor} size={24} />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading} onClick={onCancel}>
            {cancelText}
          </AlertDialogCancel>
          <Button
            variant={config.variant}
            onClick={(e) => {
              e.preventDefault(); // Prevent auto-closing if wrapped in AlertDialogAction
              onConfirm();
            }}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmText}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
