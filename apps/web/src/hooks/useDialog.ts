import { useState, useCallback } from 'react';

export interface UseDialogReturn<T = unknown> {
  open: boolean;
  data: T | null;
  openDialog: (data?: T) => void;
  closeDialog: () => void;
  setData: (data: T | null) => void;
}

/**
 * Custom hook for managing dialog/modal state
 *
 * @example
 * // Simple usage
 * const dialog = useDialog();
 * <Button onClick={() => dialog.openDialog()}>Open</Button>
 * <Dialog open={dialog.open} onClose={dialog.closeDialog}>...</Dialog>
 *
 * @example
 * // With data
 * interface EditData { id: number; name: string; }
 * const editDialog = useDialog<EditData>();
 *
 * <Button onClick={() => editDialog.openDialog({ id: 1, name: 'Item' })}>
 *   Edit
 * </Button>
 *
 * <Dialog open={editDialog.open}>
 *   {editDialog.data && <Form initialData={editDialog.data} />}
 * </Dialog>
 */
export function useDialog<T = unknown>(initialOpen = false): UseDialogReturn<T> {
  const [open, setOpen] = useState(initialOpen);
  const [data, setData] = useState<T | null>(null);

  const openDialog = useCallback((dialogData?: T) => {
    if (dialogData !== undefined) {
      setData(dialogData);
    }
    setOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setOpen(false);
    // Delay clearing data to allow for exit animations
    setTimeout(() => setData(null), 200);
  }, []);

  return {
    open,
    data,
    openDialog,
    closeDialog,
    setData,
  };
}

/**
 * Specialized hook for confirmation dialogs
 *
 * @example
 * const confirmDelete = useConfirmDialog<{ id: number }>();
 *
 * const handleDelete = async () => {
 *   if (confirmDelete.data) {
 *     await deleteItem(confirmDelete.data.id);
 *     confirmDelete.closeDialog();
 *   }
 * };
 *
 * <Button onClick={() => confirmDelete.openDialog({ id: item.id })}>
 *   Delete
 * </Button>
 *
 * <ConfirmDialog
 *   open={confirmDelete.open}
 *   onConfirm={handleDelete}
 *   onCancel={confirmDelete.closeDialog}
 * />
 */
export function useConfirmDialog<T = unknown>() {
  return useDialog<T>();
}
