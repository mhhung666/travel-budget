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
     * No push/email here. All records and the completion marker commit together or roll back.
     * Read snapshot from the leased Expense, not mutable current description/amount or caller payload.
     * Actual writes on Expense/Trip/User prevent stale membership reads from committing over
     * concurrent changes. Destructive callers must change the parent BEFORE cleaning child records.
     */
    async persist(expenseId: mongo.ObjectId, token: string) {
      const leaseFilter = {
        _id: expenseId,
        'expenseDelivery.status': 'leased',
        'expenseDelivery.token': token,
        $expr: { $gt: ['$expenseDelivery.availableAt', '$$NOW'] },
      };
      try {
        return await db.client.withSession(async (session) =>
          session.withTransaction(
            async () => {
              const expense = await db
                .collection('expenses')
                .findOneAndUpdate(
                  leaseFilter,
                  { $inc: { 'expenseDelivery.recordFence': 1 } },
                  { session, returnDocument: 'after', includeResultMetadata: false }
                );
              if (!expense)
                return { status: 'skipped' as const, reason: 'missing_or_inactive' as const };
              const event = expenseDeliveryEventSchema.parse(expense.expenseDeliveryEvent);
              if (
                event.expenseId !== expenseId.toHexString() ||
                event.tripId !== expense.trip?.toString() ||
                event.actorId !== expense.createdBy?.toString()
              )
                throw new Error('Expense event ownership mismatch');

              const trip = await db.collection('trips').findOneAndUpdate(
                { _id: new mongo.ObjectId(event.tripId), expenseDeliveryDeleting: { $ne: true } },
                { $inc: { expenseDeliveryFence: 1 } },
                {
                  session,
                  returnDocument: 'after',
                  includeResultMetadata: false,
                  projection: { members: 1 },
                }
              );
              if (!trip) return { status: 'skipped' as const, reason: 'trip_missing' as const };
              const members = (trip.members as { user: mongo.ObjectId }[]).map((member) =>
                member.user.toHexString()
              );
              const candidates = event.memberIds.filter(
                (member) => members.includes(member) && member !== event.actorId
              );
              // Real writes (not no-op updates) make user deletion / virtual conversion conflict as well.
              const userFilter = {
                _id: { $in: candidates.map((member) => new mongo.ObjectId(member)) },
              };
              await db
                .collection('users')
                .updateMany(userFilter, { $inc: { expenseDeliveryFence: 1 } }, { session });
              const users = await db
                .collection('users')
                .find(userFilter, { session, projection: { isVirtual: 1 } })
                .toArray();
              const eligible = expenseEventRecipients(
                event,
                members,
                users.map((user) => ({
                  id: user._id.toHexString(),
                  isVirtual: user.isVirtual,
                }))
              );
              const alreadyPersisted = expense.expenseDelivery.recordsPersistedAt instanceof Date;
              const recipients = alreadyPersisted
                ? eligible.filter((id) =>
                    (expense.expenseDelivery.recordRecipientIds as string[]).includes(id)
                  )
                : eligible;
              const common = {
                deliveryEventKey: event.eventKey,
                trip: new mongo.ObjectId(event.tripId),
                actor: new mongo.ObjectId(event.actorId),
                actorName: event.actorName,
                type: 'expense_added',
                meta: {
                  expense_id: event.expenseId,
                  description: event.description,
                  amount: event.amount,
                },
                createdAt: event.occurredAt,
              };
              // $setOnInsert never resets read=true or overwrites the original event metadata on replay.
              if (!alreadyPersisted) {
                await insertOnce(
                  db.collection('activitylogs'),
                  { deliveryEventKey: event.eventKey },
                  common,
                  session
                );
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
                    },
                    session
                  );
                }
              }
              // Recheck database time at the end. Expiry during fan-out rolls back every write.
              const finalized = await db.collection('expenses').updateOne(
                leaseFilter,
                [
                  {
                    $set: {
                      'expenseDelivery.recordsPersistedAt': {
                        $ifNull: ['$expenseDelivery.recordsPersistedAt', '$$NOW'],
                      },
                      'expenseDelivery.recordRecipientIds': {
                        $ifNull: ['$expenseDelivery.recordRecipientIds', { $literal: recipients }],
                      },
                    },
                  },
                ],
                { session }
              );
              if (finalized.matchedCount !== 1) throw new ExpenseEventLeaseExpired();
              return { status: 'persisted' as const, recipients };
            },
            {
              readConcern: { level: 'snapshot' },
              writeConcern: { w: 'majority' },
              readPreference: 'primary',
              timeoutMS: 10_000,
            }
          )
        );
      } catch (error) {
        if (error instanceof ExpenseEventLeaseExpired)
          return { status: 'skipped' as const, reason: 'lease_expired' as const };
        throw error;
      }
    },
  };
}

class ExpenseEventLeaseExpired extends Error {}

async function insertOnce(
  collection: mongo.Collection,
  filter: mongo.Filter<mongo.Document>,
  document: mongo.Document,
  session: mongo.ClientSession
) {
  // Never swallow errors in an aborted transaction; withTransaction handles retryable conflicts.
  await collection.updateOne(filter, { $setOnInsert: document }, { upsert: true, session });
}
