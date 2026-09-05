import { mongo } from 'mongoose';
import { expenseDeliveryEventSchema, expenseEventRecipients } from './expenseDeliveryEvent';

/** Descriptors only: no production index creation until rollout migration is approved. */
export const EXPENSE_EVENT_INDEXES = [
  {
    collection: 'notifications',
    name: 'expense_event_recipient_unique',
    key: { deliveryEventKey: 1, user: 1 },
    unique: true,
    partialFilterExpression: { deliveryEventKey: { $type: 'string' } },
  },
  {
    collection: 'activitylogs',
    name: 'expense_event_unique',
    key: { deliveryEventKey: 1 },
    unique: true,
    partialFilterExpression: { deliveryEventKey: { $type: 'string' } },
  },
] as const;

/** Refuse to run without the exact unique indexes. Only reads index metadata, never performs DDL. */
export async function createExpenseEventStore(db: mongo.Db) {
  for (const definition of EXPENSE_EVENT_INDEXES) {
    const indexes = await db.collection(definition.collection).listIndexes().toArray();
    const index = indexes.find((candidate) => candidate.name === definition.name);
    if (
      !index ||
      index.unique !== true ||
      index.sparse ||
      index.hidden ||
      index.expireAfterSeconds !== undefined ||
      (index.collation && index.collation.locale !== 'simple') ||
      JSON.stringify(index.key) !== JSON.stringify(definition.key) ||
      JSON.stringify(index.partialFilterExpression) !==
        JSON.stringify(definition.partialFilterExpression)
    ) {
      throw new Error(`Required expense event index missing or incompatible: ${definition.name}`);
    }
  }

  return {
    /**
     * No push/email here. Failures propagate for worker retry; prior writes are intentionally retained.
     * Read snapshot from the leased Expense, not mutable current description/amount or caller payload.
     * Lease and membership reads are not a transaction with the writes: final lifecycle fencing is
     * still required before activation (concurrent deletion/member removal can race this method).
     */
    async persist(expenseId: mongo.ObjectId, token: string) {
      const expense = await db.collection('expenses').findOne({
        _id: expenseId,
        'expenseDelivery.status': 'leased',
        'expenseDelivery.token': token,
        $expr: { $gt: ['$expenseDelivery.availableAt', '$$NOW'] },
      });
      if (!expense) return { status: 'skipped' as const, reason: 'missing_or_inactive' as const };
      const event = expenseDeliveryEventSchema.parse(expense.expenseDeliveryEvent);
      if (
        event.expenseId !== expenseId.toHexString() ||
        event.tripId !== expense.trip?.toString() ||
        event.actorId !== expense.createdBy?.toString()
      )
        throw new Error('Expense event ownership mismatch');

      const trip = await db
        .collection('trips')
        .findOne({ _id: new mongo.ObjectId(event.tripId) }, { projection: { members: 1 } });
      if (!trip) return { status: 'skipped' as const, reason: 'trip_missing' as const };
      const members = (trip.members as { user: mongo.ObjectId }[]).map((member) =>
        member.user.toHexString()
      );
      const candidates = event.memberIds.filter(
        (member) => members.includes(member) && member !== event.actorId
      );
      const users = await db
        .collection('users')
        .find(
          { _id: { $in: candidates.map((member) => new mongo.ObjectId(member)) } },
          { projection: { isVirtual: 1 } }
        )
        .toArray();
      const recipients = expenseEventRecipients(
        event,
        members,
        users.map((user) => ({
          id: user._id.toHexString(),
          isVirtual: user.isVirtual,
        }))
      );
      const common = {
        deliveryEventKey: event.eventKey,
        trip: new mongo.ObjectId(event.tripId),
        actor: new mongo.ObjectId(event.actorId),
        actorName: event.actorName,
        type: 'expense_added',
        meta: { expense_id: event.expenseId, description: event.description, amount: event.amount },
        createdAt: event.occurredAt,
      };
      // $setOnInsert never resets read=true or overwrites the original event metadata on replay.
      await insertOnce(db.collection('activitylogs'), { deliveryEventKey: event.eventKey }, common);
      for (const recipient of recipients) {
        const user = new mongo.ObjectId(recipient);
        await insertOnce(
          db.collection('notifications'),
          { deliveryEventKey: event.eventKey, user },
          {
            ...common,
            user,
            tripName: event.tripName,
            read: false,
          }
        );
      }
      return { status: 'persisted' as const, recipients };
    },
  };
}

async function insertOnce(
  collection: mongo.Collection,
  filter: mongo.Filter<mongo.Document>,
  document: mongo.Document
) {
  try {
    await collection.updateOne(filter, { $setOnInsert: document }, { upsert: true });
  } catch (error) {
    // Only accept an actual competing insert for this exact identity; all other errors must retry/fail.
    const duplicate = error as { code?: number; keyPattern?: Record<string, number> } | null;
    const expected = Object.keys(filter);
    const actual = Object.keys(duplicate?.keyPattern ?? {});
    if (
      duplicate?.code !== 11000 ||
      actual.length !== expected.length ||
      !expected.every((field) => duplicate?.keyPattern?.[field] === 1) ||
      !(await collection.findOne(filter, { projection: { _id: 1 } }))
    )
      throw error;
  }
}
