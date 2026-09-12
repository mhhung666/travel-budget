'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { expenseOutboxQueryKey, readExpenseOutbox } from '@/lib/expenseOutbox';

export function useExpenseOutbox() {
  const client = useQueryClient();
  return useQuery({
    queryKey: expenseOutboxQueryKey,
    queryFn: () => readExpenseOutbox(client),
    networkMode: 'always',
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
