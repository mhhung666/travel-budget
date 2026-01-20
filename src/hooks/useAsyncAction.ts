import { useState, useCallback } from 'react';

export interface UseAsyncActionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface UseAsyncActionReturn<T, Args extends unknown[]> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (...args: Args) => Promise<T | null>;
  reset: () => void;
  setData: (data: T | null) => void;
}

/**
 * Custom hook for managing async operations with loading and error states
 *
 * @example
 * // Basic usage
 * const { data, loading, error, execute } = useAsyncAction(async (id: string) => {
 *   const response = await fetch(`/api/items/${id}`);
 *   if (!response.ok) throw new Error('Failed to fetch');
 *   return response.json();
 * });
 *
 * useEffect(() => {
 *   execute('123');
 * }, []);
 *
 * if (loading) return <CircularProgress />;
 * if (error) return <Alert severity="error">{error}</Alert>;
 * if (data) return <ItemDisplay item={data} />;
 *
 * @example
 * // Form submission
 * const { loading, error, execute } = useAsyncAction(async (formData: FormData) => {
 *   const response = await fetch('/api/submit', {
 *     method: 'POST',
 *     body: formData,
 *   });
 *   if (!response.ok) {
 *     const data = await response.json();
 *     throw new Error(data.error || 'Submission failed');
 *   }
 *   return response.json();
 * });
 *
 * const handleSubmit = async (e: FormEvent) => {
 *   e.preventDefault();
 *   const result = await execute(new FormData(e.target as HTMLFormElement));
 *   if (result) {
 *     // Success handling
 *   }
 * };
 */
export function useAsyncAction<T, Args extends unknown[] = []>(
  asyncFn: (...args: Args) => Promise<T>
): UseAsyncActionReturn<T, Args> {
  const [state, setState] = useState<UseAsyncActionState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const result = await asyncFn(...args);
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
        return null;
      }
    },
    [asyncFn]
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  const setData = useCallback((data: T | null) => {
    setState((prev) => ({ ...prev, data }));
  }, []);

  return {
    ...state,
    execute,
    reset,
    setData,
  };
}

/**
 * Simpler version for mutations (POST, PUT, DELETE) that don't need to store response data
 *
 * @example
 * const { loading, error, execute } = useMutation(async (id: string) => {
 *   const response = await fetch(`/api/items/${id}`, { method: 'DELETE' });
 *   if (!response.ok) throw new Error('Delete failed');
 * });
 *
 * const handleDelete = async () => {
 *   await execute(item.id);
 *   // Refresh list or navigate away
 * };
 */
export function useMutation<Args extends unknown[] = []>(
  asyncFn: (...args: Args) => Promise<void>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (...args: Args): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        await asyncFn(...args);
        setLoading(false);
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        setLoading(false);
        return false;
      }
    },
    [asyncFn]
  );

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return { loading, error, execute, reset };
}
