import type { mongo } from 'mongoose';
import { createExpenseDeliveryQueue, type ExpenseDeliveryRecord } from './expenseDeliveryQueue';
import { createExpenseEventStore } from './expenseEventStore';
import { createExpensePushCheckpoint } from './expensePushCheckpoint';
import { createExpensePushCandidates } from './expensePushCandidates';
import { createExpensePushSweep } from './expensePushSweep';
import { createExpensePushPrepare } from './expensePushPrepare';
import { runExpensePushBatch } from './expensePushRunner';

type Queue = ReturnType<typeof createExpenseDeliveryQueue>;
type EventStore = Awaited<ReturnType<typeof createExpenseEventStore>>;
export interface ExpenseWorkerDependencies {
  queue: Queue;
  persist: EventStore['persist'];
  run(id: mongo.ObjectId, token: string): ReturnType<typeof runExpensePushBatch>;
  pushEnabled: boolean;
}

/** One claimed job/batch per invocation. Counts contain no payload, endpoint or raw errors. */
export async function processExpenseDelivery(deps: ExpenseWorkerDependencies) {
  if (await deps.queue.reapExpired()) return { status: 'dead' as const };
  const job = await deps.queue.claim();
  const token = job?.expenseDelivery?.token;
  if (!job || !token) return { status: 'idle' as const };
  const id = job._id;
  try {
    const records = await deps.persist(id, token);
    if (!records || records.status !== 'persisted') {
      if (records?.reason === 'trip_missing') {
        return {
          status: (await deps.queue.abandon(id, token, 'trip_missing'))
            ? ('dead' as const)
            : ('stopped' as const),
        };
      }
      return { status: 'stopped' as const };
    }
    // Missing VAPID intentionally disables push, matching the existing notification policy.
    // In-app records still persist. It is not a provider failure or a future backfill request.
    if (!deps.pushEnabled)
      return {
        status: (await deps.queue.complete(id, token)) ? ('done' as const) : ('stopped' as const),
      };
    const batch = await deps.run(id, token);
    let saved: boolean;
    switch (batch.status) {
      case 'exhausted':
        // Policy: only the initially persisted device cohort is due this event.
        // Later registrations are not historical backfill targets; prepare handles eligibility.
        saved = await deps.queue.complete(id, token);
        return { status: saved ? ('done' as const) : ('stopped' as const) };
      case 'yielded':
        saved =
          'progressed' in batch && batch.progressed
            ? await deps.queue.yield(id, token)
            : await deps.queue.fail(id, token, 'worker_error');
        return { status: saved ? ('pending' as const) : ('stopped' as const) };
      case 'capacity':
        saved = await deps.queue.abandon(id, token, 'capacity');
        return { status: saved ? ('dead' as const) : ('stopped' as const) };
      case 'retry':
      case 'disabled':
        saved = await deps.queue.fail(id, token, 'delivery_failed');
        return { status: saved ? ('failed' as const) : ('stopped' as const) };
      default:
        return { status: 'stopped' as const };
    }
  } catch {
    // Unknown writes may have committed. Active-token CAS refuses to alter a released job.
    // Never log the exception: MongoDB errors may contain subscription secrets.
    const saved = await deps.queue.fail(id, token, 'worker_error');
    return { status: saved ? ('failed' as const) : ('stopped' as const) };
  }
}

/** Explicit composition; does not connect, schedule, migrate or enable application writes. */
export async function createExpenseDeliveryWorker(
  db: mongo.Db,
  options: Parameters<typeof createExpensePushPrepare>[3]
) {
  const collection = db.collection<ExpenseDeliveryRecord>('expenses');
  const queue = createExpenseDeliveryQueue(collection);
  const events = await createExpenseEventStore(db);
  const sweep = createExpensePushSweep(collection);
  const checkpoint = createExpensePushCheckpoint(collection);
  const discover = createExpensePushCandidates(db);
  return () =>
    processExpenseDelivery({
      queue,
      persist: events.persist,
      pushEnabled: options.config !== null,
      run: (id, token) =>
        runExpensePushBatch(
          id,
          token,
          {
            sweep,
            discover: () => discover(id, token),
            renew: () => queue.renew(id, token),
            executor: {
              read: () => checkpoint.read(id, token),
              record: (subscriptionId, status) =>
                checkpoint.record(id, token, subscriptionId, status),
              prepare: createExpensePushPrepare(db, id, token, options),
            },
          },
          { budgetMs: 15_000, maxDevices: 32 }
        ),
    });
}
