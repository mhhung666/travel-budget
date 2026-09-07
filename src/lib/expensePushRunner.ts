import type { mongo } from 'mongoose';
import type { createExpensePushSweep } from './expensePushSweep';
import type { ExpensePushCandidatesResult } from './expensePushCandidates';
import {
  executeExpensePushBatch,
  type ExpensePushExecutorDependencies,
} from './expensePushExecutor';

type SweepStore = ReturnType<typeof createExpensePushSweep>;

/** One serial batch per lease. Never share a token between concurrent runners. */
export async function runExpensePushBatch(
  id: mongo.ObjectId,
  token: string,
  dependencies: {
    sweep: SweepStore;
    discover(): Promise<ExpensePushCandidatesResult>;
    renew(): Promise<boolean>;
    executor: ExpensePushExecutorDependencies;
  },
  limits: { maxDevices?: number; budgetMs?: number } = {}
) {
  let stored = await dependencies.sweep.read(id, token);
  if (stored.status === 'stop') return { status: 'stopped' as const };
  if (stored.status === 'missing') {
    const candidates = await dependencies.discover();
    if (candidates.status !== 'ready')
      return {
        status: candidates.status === 'stop' ? ('stopped' as const) : ('capacity' as const),
      };
    await dependencies.sweep.initialize(id, token, candidates.subscriptionIds);
    // Even on false, only the winning persisted snapshot may be executed. No unbounded retry.
    stored = await dependencies.sweep.read(id, token);
    if (stored.status !== 'ready') return { status: 'stopped' as const };
  }
  if (stored.status !== 'ready') return { status: 'stopped' as const };
  const sweep = stored.sweep;
  if (sweep.status !== 'running') return { status: sweep.status };
  if (!(await dependencies.renew())) return { status: 'stopped' as const };
  const now = dependencies.executor.now ?? (() => performance.now());
  let renewedAt = now();
  const execution = await executeExpensePushBatch(
    sweep.subscriptionIds,
    {
      ...dependencies.executor,
      read: async () => {
        // Serialized heartbeat, no detached timer racing completion or another batch.
        if (now() - renewedAt >= 15_000) {
          if (!(await dependencies.renew())) return null;
          renewedAt = now();
        }
        return dependencies.executor.read();
      },
    },
    {
      ...limits,
      ...(sweep.subscriptionIds.length
        ? {
            continuation: {
              subscriptionIds: sweep.subscriptionIds,
              nextIndex: sweep.nextIndex,
              hadFailures: sweep.hadFailures,
            },
          }
        : {}),
    }
  );
  if (['yielded', 'retry', 'exhausted'].includes(execution.status)) {
    if (!(await dependencies.sweep.save(id, token, sweep, execution)))
      return { status: 'stopped' as const, execution };
  }
  return {
    status: execution.status,
    execution,
    // Only a successfully saved forward cursor can refund a normal batch claim.
    progressed:
      execution.status === 'yielded' && execution.continuation!.nextIndex > sweep.nextIndex,
  };
}
