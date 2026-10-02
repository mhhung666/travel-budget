import { randomUUID } from 'node:crypto';
import type { mongo } from 'mongoose';
import { z } from 'zod';
import type { ExpenseDeliveryRecord } from './expenseDeliveryQueue';
import type { ExpensePushExecutionResult } from './expensePushExecutor';
import { EXPENSE_PUSH_CHECKPOINT_LIMIT } from './expensePushCheckpoint';

const idsSchema = z
  .array(z.string().regex(/^[a-f0-9]{24}$/))
  .max(EXPENSE_PUSH_CHECKPOINT_LIMIT)
  .refine((ids) => new Set(ids).size === ids.length);
const sweepSchema = z
  .object({
    snapshotId: z.uuid(),
    subscriptionIds: idsSchema,
    revision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    nextIndex: z.number().int().min(0),
    hadFailures: z.boolean(),
    status: z.enum(['running', 'exhausted', 'retry']),
  })
  .strict()
  .refine((sweep) => {
    const length = sweep.subscriptionIds.length;
    if (sweep.status === 'running')
      return sweep.nextIndex < length || (length === 0 && sweep.nextIndex === 0);
    return sweep.nextIndex === length && sweep.hadFailures === (sweep.status === 'retry');
  });

export type ExpensePushSweep = z.infer<typeof sweepSchema>;

/** Dormant persistence only. No HTTP, scheduling, retry reset or queue completion. */
export function createExpensePushSweep(collection: mongo.Collection<ExpenseDeliveryRecord>) {
  const options = { maxTimeMS: 2_000, timeoutMS: 2_000 };
  const active = (_id: mongo.ObjectId, token: string) => ({
    _id,
    'expenseDelivery.status': 'leased' as const,
    'expenseDelivery.token': token,
    'expenseDelivery.recordsPersistedAt': { $type: 'date' as const },
    $expr: { $gt: ['$expenseDelivery.availableAt', '$$NOW'] },
  });
  return {
    /** missing permits discovery; stop never does. Invalid stored state fails closed. */
    async read(
      _id: mongo.ObjectId,
      token: string
    ): Promise<{ status: 'stop' | 'missing' } | { status: 'ready'; sweep: ExpensePushSweep }> {
      const record = await collection.findOne(active(_id, token), {
        ...options,
        readPreference: 'primary',
        projection: { 'expenseDelivery.pushSweep': 1 },
      });
      if (!record) return { status: 'stop' };
      const sweep = record.expenseDelivery?.pushSweep;
      return sweep === undefined
        ? { status: 'missing' }
        : { status: 'ready', sweep: sweepSchema.parse(sweep) };
    },

    /** First writer wins. false means re-read, not permission to use the proposed list. */
    async initialize(
      _id: mongo.ObjectId,
      token: string,
      subscriptionIds: readonly string[]
    ): Promise<boolean> {
      const ids = idsSchema.parse(subscriptionIds);
      const filter = active(_id, token);
      const sweep: ExpensePushSweep = {
        snapshotId: randomUUID(),
        subscriptionIds: ids,
        revision: 0,
        nextIndex: 0,
        hadFailures: false,
        status: 'running',
      };
      const result = await collection.updateOne(
        {
          ...filter,
          'expenseDelivery.pushSweep': { $exists: false },
          $expr: {
            $and: [
              filter.$expr,
              {
                $lte: [
                  {
                    $size: {
                      $setUnion: [
                        { $literal: ids },
                        {
                          $map: {
                            input: {
                              $objectToArray: { $ifNull: ['$expenseDelivery.pushCheckpoints', {}] },
                            },
                            as: 'checkpoint',
                            in: '$$checkpoint.k',
                          },
                        },
                      ],
                    },
                  },
                  EXPENSE_PUSH_CHECKPOINT_LIMIT,
                ],
              },
            ],
          },
        },
        { $set: { 'expenseDelivery.pushSweep': sweep } },
        {
          ...options,
          writeConcern: { w: 'majority' },
        }
      );
      return result.matchedCount === 1;
    },

    /** Trusted executor result only; CAS prevents stale/duplicate saves, not duplicate HTTP. */
    async save(
      _id: mongo.ObjectId,
      token: string,
      expected: ExpensePushSweep,
      result: Pick<ExpensePushExecutionResult, 'status' | 'continuation'>
    ): Promise<boolean> {
      const previous = sweepSchema.parse(expected);
      if (previous.status !== 'running') throw new Error('Push sweep already finished');
      let nextIndex: number;
      let hadFailures: boolean;
      let status: ExpensePushSweep['status'];
      if (result.status === 'yielded' && result.continuation) {
        const continuation = result.continuation;
        const ids = idsSchema.parse(continuation.subscriptionIds);
        if (
          ids.length !== previous.subscriptionIds.length ||
          ids.some((id, i) => id !== previous.subscriptionIds[i])
        )
          throw new Error('Push sweep candidates changed');
        nextIndex = continuation.nextIndex;
        hadFailures = continuation.hadFailures;
        status = 'running';
      } else if (
        (result.status === 'exhausted' || result.status === 'retry') &&
        result.continuation === null
      ) {
        nextIndex = previous.subscriptionIds.length;
        hadFailures = result.status === 'retry';
        status = result.status;
      } else throw new Error('Push result cannot advance sweep');
      if (nextIndex < previous.nextIndex || (previous.hadFailures && !hadFailures))
        throw new Error('Push sweep progress regressed');
      const next = sweepSchema.parse({
        ...previous,
        nextIndex,
        hadFailures,
        status,
        revision: previous.revision + 1,
      });
      const saved = await collection.updateOne(
        {
          ...active(_id, token),
          'expenseDelivery.pushSweep.snapshotId': previous.snapshotId,
          'expenseDelivery.pushSweep.revision': previous.revision,
          'expenseDelivery.pushSweep.subscriptionIds': previous.subscriptionIds,
          'expenseDelivery.pushSweep.nextIndex': previous.nextIndex,
          'expenseDelivery.pushSweep.hadFailures': previous.hadFailures,
          'expenseDelivery.pushSweep.status': 'running',
        },
        { $set: { 'expenseDelivery.pushSweep': next } },
        {
          ...options,
          writeConcern: { w: 'majority' },
        }
      );
      return saved.matchedCount === 1;
    },
  };
}
