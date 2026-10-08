import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { useRecoveryClock } from './useRecoveryClock';
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
export function useRecoveryDeadline(scope: PendingScope | null, revision: unknown, rowUntil = 0) {
  const query = useQuery(recoveryDeadlineOptions(scope));
  const { refetch } = query;
  const enabled = !!scope;
  const observed = useRef({
    environment: scope?.environment,
    accountId: scope?.accountId,
    revision,
  });
  // Query handles mount/scope fetches. Only an existing scope's new revision needs another read.
  useEffect(() => {
    const previous = observed.current;
    observed.current = { environment: scope?.environment, accountId: scope?.accountId, revision };
    if (
      enabled &&
      previous.environment === scope?.environment &&
      previous.accountId === scope?.accountId &&
      !Object.is(previous.revision, revision)
    )
      void refetch();
  }, [enabled, scope?.environment, scope?.accountId, revision, refetch]);
  const until = query.data ?? 0;
  const now = useRecoveryClock(Math.max(until, rowUntil));
  return { ...query, until, now, waiting: until > now };
}
