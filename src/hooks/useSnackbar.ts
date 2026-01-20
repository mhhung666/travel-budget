import { useState, useCallback } from 'react';

export type SnackbarSeverity = 'success' | 'error' | 'warning' | 'info';

export interface SnackbarState {
  open: boolean;
  message: string;
  severity: SnackbarSeverity;
}

export interface UseSnackbarReturn {
  state: SnackbarState;
  show: (message: string, severity?: SnackbarSeverity) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
  hide: () => void;
}

const initialState: SnackbarState = {
  open: false,
  message: '',
  severity: 'success',
};

/**
 * Custom hook for managing snackbar/toast notifications
 *
 * @example
 * const snackbar = useSnackbar();
 *
 * // Show notifications
 * snackbar.showSuccess('Saved successfully!');
 * snackbar.showError('Something went wrong');
 *
 * // Or use the generic show method
 * snackbar.show('Custom message', 'warning');
 *
 * // In JSX
 * <Snackbar
 *   open={snackbar.state.open}
 *   onClose={snackbar.hide}
 *   autoHideDuration={3000}
 * >
 *   <Alert severity={snackbar.state.severity}>
 *     {snackbar.state.message}
 *   </Alert>
 * </Snackbar>
 */
export function useSnackbar(): UseSnackbarReturn {
  const [state, setState] = useState<SnackbarState>(initialState);

  const show = useCallback((message: string, severity: SnackbarSeverity = 'success') => {
    setState({ open: true, message, severity });
  }, []);

  const showSuccess = useCallback((message: string) => {
    show(message, 'success');
  }, [show]);

  const showError = useCallback((message: string) => {
    show(message, 'error');
  }, [show]);

  const showWarning = useCallback((message: string) => {
    show(message, 'warning');
  }, [show]);

  const showInfo = useCallback((message: string) => {
    show(message, 'info');
  }, [show]);

  const hide = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  return {
    state,
    show,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    hide,
  };
}
