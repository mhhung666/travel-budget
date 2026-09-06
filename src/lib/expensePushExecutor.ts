import { EXPENSE_PUSH_CHECKPOINT_LIMIT } from './expensePushCheckpoint';
import type { ExpenseDeliveryState } from './expenseDeliveryQueue';

type Checkpoints = NonNullable<ExpenseDeliveryState['pushCheckpoints']>;
type Terminal = 'accepted' | 'expired';

export interface ExpensePushExecutorDependencies {
  /** Bind these operations to one expense and lease token. Storage errors must propagate. */
  read(): Promise<Checkpoints | null>;
  record(subscriptionId: string, status: Terminal): Promise<boolean>;
  /**
   * Recheck current trip/user eligibility, first persisted recipients and subscription ownership.
   * ready must contain a single-device sender with a bounded transport timeout, never sendPush.
   * No HTTP in a DB transaction. stop means missing job/lease/parent, not a skipped recipient.
   */
  prepare(
    subscriptionId: string
  ): Promise<
    | { status: 'skip' }
    | { status: 'stop' }
    | { status: 'disabled' }
    | { status: 'ready'; send(): Promise<Terminal | 'failed'> }
  >;
  /** Monotonic milliseconds; injectable for deterministic tests. */
  now?: () => number;
}

export type ExpensePushExecutionResult = {
  /** exhausted only covers the supplied snapshot, never authorizes completing the queue job. */
  status: 'exhausted' | 'retry' | 'stopped' | 'disabled' | 'capacity' | 'yielded';
  attempted: number;
  checkpointed: number;
  skipped: number;
};

/** Dormant sequential executor: no DB connection, subscription discovery, HTTP or queue activation. */
export async function executeExpensePushBatch(
  subscriptionIds: readonly string[],
  dependencies: ExpensePushExecutorDependencies,
  limits: { maxDevices?: number; budgetMs?: number } = {}
): Promise<ExpensePushExecutionResult> {
  const maxDevices = limits.maxDevices ?? 32;
  const budgetMs = limits.budgetMs ?? 20_000;
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 256)
    throw new Error('Invalid device limit');
  if (!Number.isFinite(budgetMs) || budgetMs <= 0 || budgetMs > 30_000)
    throw new Error('Invalid time budget');
  if (subscriptionIds.some((id) => !/^[a-f0-9]{24}$/.test(id)))
    throw new Error('Invalid subscription ID');

  const ids = [...new Set(subscriptionIds)];
  const now = dependencies.now ?? (() => performance.now());
  const deadline = now() + budgetMs;
  const counts = { attempted: 0, checkpointed: 0, skipped: 0 };
  const result = (status: ExpensePushExecutionResult['status']) => ({ status, ...counts });
  const initial = await dependencies.read();
  if (initial === null) return result('stopped');
  // Conservative preflight includes old checkpoints and all candidates before any HTTP.
  if (new Set([...Object.keys(initial), ...ids]).size > EXPENSE_PUSH_CHECKPOINT_LIMIT)
    return result('capacity');

  let visited = 0;
  let failed = false;
  for (const id of ids) {
    if (visited >= maxDevices || now() >= deadline) return result('yielded');
    visited++;
    const progress = await dependencies.read();
    if (progress === null) return result('stopped');
    if (Object.hasOwn(progress, id)) {
      counts.skipped++;
      continue;
    }
    if (Object.keys(progress).length >= EXPENSE_PUSH_CHECKPOINT_LIMIT) return result('capacity');
    const prepared = await dependencies.prepare(id);
    if (prepared.status === 'stop') return result('stopped');
    if (prepared.status === 'disabled') return result('disabled');
    if (prepared.status === 'skip') {
      counts.skipped++;
      continue;
    }
    // Preparation may be slow. Revalidate the lease/progress immediately before HTTP.
    const latest = await dependencies.read();
    if (latest === null) return result('stopped');
    if (Object.hasOwn(latest, id)) {
      counts.skipped++;
      continue;
    }
    if (Object.keys(latest).length >= EXPENSE_PUSH_CHECKPOINT_LIMIT) return result('capacity');
    if (now() >= deadline) return result('yielded');
    counts.attempted++;
    // Exceptions propagate; never classify unknown transport errors as terminal outcomes.
    const outcome = await prepared.send();
    if (outcome === 'failed') {
      failed = true;
      continue;
    }
    if (outcome !== 'accepted' && outcome !== 'expired') throw new Error('Invalid push outcome');
    // Always attempt checkpointing a terminal result, even if HTTP exceeded this batch's budget.
    if (!(await dependencies.record(id, outcome))) return result('stopped');
    counts.checkpointed++;
  }
  return result(failed ? 'retry' : 'exhausted');
}
