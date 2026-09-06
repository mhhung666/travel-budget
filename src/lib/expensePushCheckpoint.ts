import type { mongo } from 'mongoose';
import type { ExpenseDeliveryRecord } from './expenseDeliveryQueue';

/** Bound embedded progress growth; exceeding this requires operator handling, never silent success. */
export const EXPENSE_PUSH_CHECKPOINT_LIMIT = 256;

/** Dormant DB-only foundation. No subscription queries, network requests or worker activation. */
export function createExpensePushCheckpoint(collection: mongo.Collection<ExpenseDeliveryRecord>) {
  const active = (_id: mongo.ObjectId, token: string) => ({
    _id,
    'expenseDelivery.status': 'leased' as const,
    'expenseDelivery.token': token,
    'expenseDelivery.recordsPersistedAt': { $type: 'date' as const },
    $expr: { $gt: ['$expenseDelivery.availableAt', '$$NOW'] },
  });

  return {
    /** null means stop, not an empty success. Eligibility must still be rechecked before HTTP. */
    async read(_id: mongo.ObjectId, token: string) {
      const record = await collection.findOne(active(_id, token), {
        projection: { 'expenseDelivery.pushCheckpoints': 1 },
      });
      return record ? (record.expenseDelivery?.pushCheckpoints ?? {}) : null;
    },

    /** Persist each terminal result immediately; failed/uncertain requests remain retryable. */
    async record(
      _id: mongo.ObjectId,
      token: string,
      subscriptionId: string,
      status: 'accepted' | 'expired'
    ): Promise<boolean> {
      if (!/^[a-f0-9]{24}$/.test(subscriptionId)) throw new Error('Invalid subscription ID');
      if (status !== 'accepted' && status !== 'expired') throw new Error('Invalid push checkpoint');
      const path = `expenseDelivery.pushCheckpoints.${subscriptionId}`;
      const filter = active(_id, token);
      const result = await collection.updateOne(
        {
          ...filter,
          $expr: {
            $and: [
              filter.$expr,
              {
                $or: [
                  { $ne: [{ $type: `$${path}` }, 'missing'] },
                  {
                    $lt: [
                      {
                        $size: {
                          $objectToArray: { $ifNull: ['$expenseDelivery.pushCheckpoints', {}] },
                        },
                      },
                      EXPENSE_PUSH_CHECKPOINT_LIMIT,
                    ],
                  },
                ],
              },
            ],
          },
        },
        [{ $set: { [path]: { $ifNull: [`$${path}`, { status, recordedAt: '$$NOW' }] } } }]
      );
      // No upsert: deleted expenses and stale workers cannot recreate progress.
      // A duplicate terminal result preserves the first outcome and timestamp.
      return result.matchedCount === 1;
    },
  };
}
