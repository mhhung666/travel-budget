'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import { Warning, Error, Info } from '@mui/icons-material';

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
    icon: Warning,
    color: 'warning.main',
    buttonColor: 'warning' as const,
  },
  error: {
    icon: Error,
    color: 'error.main',
    buttonColor: 'error' as const,
  },
  info: {
    icon: Info,
    color: 'info.main',
    buttonColor: 'primary' as const,
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

  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Icon sx={{ color: config.color }} />
          {title}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography>{message}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          color={config.buttonColor}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
