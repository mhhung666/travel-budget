import { mongo } from 'mongoose';
import { expenseDeliveryEventSchema } from './expenseDeliveryEvent';
import { EXPENSE_PUSH_CHECKPOINT_LIMIT } from './expensePushCheckpoint';

export type ExpensePushCandidatesResult =
  | { status: 'stop' | 'capacity' }
  | { status: 'ready'; subscriptionIds: string[] };

/**
 * Dormant, read-only candidate discovery, not delivery authorization or job completion.
 * Keep the returned list unchanged across executor continuations. It is not a DB snapshot:
 * registrations may change during/after discovery. prepare must recheck current eligibility.
 */
export function createExpensePushCandidates(db: mongo.Db) {
  const queryOptions = { readPreference: 'primary' as const, maxTimeMS: 2_000, timeoutMS: 2_000 };
  return async (expenseId: mongo.ObjectId, token: string): Promise<ExpensePushCandidatesResult> => {
    const active = {
      _id: expenseId,
      'expenseDelivery.status': 'leased',
      'expenseDelivery.token': token,
      'expenseDelivery.recordsPersistedAt': { $type: 'date' },
      $expr: { $gt: ['$expenseDelivery.availableAt', '$$NOW'] },
    };
    const expenses = db.collection('expenses');
    const expense = await expenses.findOne(active, {
      ...queryOptions,
      projection: {
        trip: 1,
        createdBy: 1,
        expenseDeliveryEvent: 1,
        'expenseDelivery.recordRecipientIds': 1,
        'expenseDelivery.pushCheckpoints': 1,
      },
    });
    if (!expense) return { status: 'stop' };
    const event = expenseDeliveryEventSchema.parse(expense.expenseDeliveryEvent);
    if (
      event.expenseId !== expenseId.toHexString() ||
      event.tripId !== expense.trip?.toString() ||
      event.actorId !== expense.createdBy?.toString()
    )
      throw new Error('Expense event ownership mismatch');
    const recipients: unknown = expense.expenseDelivery?.recordRecipientIds;
    if (
      !Array.isArray(recipients) ||
      recipients.some((id) => typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id))
    )
      throw new Error('Invalid persisted expense recipients');
    const completed = checkpointIds(expense.expenseDelivery?.pushCheckpoints);
    if (completed.length > EXPENSE_PUSH_CHECKPOINT_LIMIT) return { status: 'capacity' };
    const firstRecipients = new Set(recipients);
    // Conservative superset: removed/virtual users are filtered by prepare, not authorized here.
    const users = event.memberIds
      .filter((id) => id !== event.actorId && firstRecipients.has(id))
      .map((id) => new mongo.ObjectId(id));
    const remaining = EXPENSE_PUSH_CHECKPOINT_LIMIT - completed.length;
    const candidates = users.length
      ? await db
          .collection('pushsubscriptions')
          .find(
            { user: { $in: users }, _id: { $nin: completed.map((id) => new mongo.ObjectId(id)) } },
            { ...queryOptions, projection: { _id: 1 } }
          )
          .sort({ _id: 1 })
          .limit(remaining + 1)
          .toArray()
      : [];
    // Even an empty result must not turn an expired/deleted job into apparent success.
    const latest = await expenses.findOne(active, {
      ...queryOptions,
      projection: { 'expenseDelivery.pushCheckpoints': 1 },
    });
    if (!latest) return { status: 'stop' };
    const latestCompleted = checkpointIds(latest.expenseDelivery?.pushCheckpoints);
    const subscriptionIds = candidates.map((candidate) => candidate._id.toHexString());
    if (
      candidates.length > remaining ||
      new Set([...latestCompleted, ...subscriptionIds]).size > EXPENSE_PUSH_CHECKPOINT_LIMIT
    )
      return { status: 'capacity' };
    const terminal = new Set(latestCompleted);
    return { status: 'ready', subscriptionIds: subscriptionIds.filter((id) => !terminal.has(id)) };
  };
}

function checkpointIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid push checkpoints');
  return Object.entries(value).map(([id, checkpoint]) => {
    if (
      !/^[a-f0-9]{24}$/.test(id) ||
      !checkpoint ||
      (checkpoint.status !== 'accepted' && checkpoint.status !== 'expired') ||
      !(checkpoint.recordedAt instanceof Date) ||
      !Number.isFinite(checkpoint.recordedAt.getTime())
    )
      throw new Error('Invalid push checkpoints');
    return id;
  });
}
