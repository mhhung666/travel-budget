import type { mongo } from 'mongoose';

/** Bounded-time aggregate for operators. Never return event contents, recipients or raw errors. */
export async function expenseDeliveryHealth(db: mongo.Db) {
  const rows = await db
    .collection('expenses')
    .aggregate<{
      _id: 'pending' | 'leased' | 'done' | 'dead';
      count: number;
      oldest: Date | null;
    }>(
      [
        { $match: { 'expenseDelivery.status': { $in: ['pending', 'leased', 'done', 'dead'] } } },
        {
          $group: {
            _id: '$expenseDelivery.status',
            count: { $sum: 1 },
            oldest: { $min: '$createdAt' },
          },
        },
      ],
      { readPreference: 'primary', maxTimeMS: 2_000, timeoutMS: 2_000 }
    )
    .toArray();
  const counts = { pending: 0, leased: 0, done: 0, dead: 0 };
  let oldestPendingAt: string | null = null;
  for (const row of rows) {
    if (!Object.hasOwn(counts, row._id) || !Number.isSafeInteger(row.count) || row.count < 0)
      throw new Error('Invalid expense delivery health');
    counts[row._id] = row.count;
    if (
      row._id === 'pending' &&
      row.oldest instanceof Date &&
      Number.isFinite(row.oldest.getTime())
    )
      oldestPendingAt = row.oldest.toISOString();
  }
  return { counts, oldestPendingAt };
}
