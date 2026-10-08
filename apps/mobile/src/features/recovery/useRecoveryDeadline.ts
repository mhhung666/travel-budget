import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import type { PendingScope } from '@/storage/pendingExpenses';

/** C/D/E use the same durable account deadline. Presentation never resets or extends it. */
export function recoveryDeadlineOptions(scope: PendingScope | null) {
  return {
    queryKey: [scope?.environment, scope?.accountId, 'recovery-deadline'],
    enabled: !!scope,
    networkMode: 'always' as const,
    staleTime: 0,
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => (await openMutationStore()).retryAt(scope!),
  };
}
export function useRecoveryDeadline(scope: PendingScope | null, revision: unknown) {
  const query = useQuery(recoveryDeadlineOptions(scope));
  const { refetch } = query;
  const enabled = !!scope;
  // Reload after local records or an action outcome changes, including persisted HTTP 429s.
  useEffect(() => {
    if (enabled) void refetch();
  }, [enabled, scope?.environment, scope?.accountId, revision, refetch]);
  const [now, setNow] = useState(Date.now);
  const until = query.data ?? 0;
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  return { ...query, until, waiting: until > now };
}
