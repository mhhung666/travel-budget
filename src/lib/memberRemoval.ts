import { mongo } from 'mongoose';

export class MemberRemovalError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION_ERROR') {
    super(code);
  }
}

export async function removeTripMember(
  db: mongo.Db,
  input: { tripId: string; actorId: string; targetId: string }
) {
  if (input.actorId === input.targetId) throw new MemberRemovalError('VALIDATION_ERROR');
  const trip = new mongo.ObjectId(input.tripId);
  const actor = new mongo.ObjectId(input.actorId);
  const target = new mongo.ObjectId(input.targetId);
  return db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const options = { session };
        const parent = await db.collection('trips').findOneAndUpdate(
          {
            _id: trip,
            expenseDeliveryDeleting: { $ne: true },
            members: { $elemMatch: { user: actor, role: 'admin' } },
          },
          { $inc: { expenseDeliveryFence: 1 } },
          { ...options, returnDocument: 'after' }
        );
        if (!parent) throw new MemberRemovalError('FORBIDDEN');
        if (!parent.members.some((member: { user: mongo.ObjectId }) => member.user.equals(target)))
          throw new MemberRemovalError('NOT_FOUND');
        const expense = await db
          .collection('expenses')
          .findOne(
            { trip, $or: [{ payer: target }, { 'splits.user': target }] },
            { ...options, projection: { _id: 1 } }
          );
        const payment = await db
          .collection('payments')
          .findOne(
            { trip, $or: [{ from: target }, { to: target }] },
            { ...options, projection: { _id: 1 } }
          );
        await db.collection('trips').updateOne(
          { _id: trip },
          {
            $set: {
              members: parent.members.filter(
                (member: { user: mongo.ObjectId }) => !member.user.equals(target)
              ),
            },
          },
          options
        );
        await db
          .collection('checklists')
          .updateMany(
            { trip, 'items.assignee': target },
            { $set: { 'items.$[item].assignee': null } },
            { ...options, arrayFilters: [{ 'item.assignee': target }] }
          );
        await db
          .collection<{ trip: mongo.ObjectId; 'items.$[].doneBy': mongo.ObjectId[] }>('checklists')
          .updateMany(
            { trip, 'items.doneBy': target },
            { $pull: { 'items.$[].doneBy': target } },
            options
          );
        await db.collection('notifications').deleteMany({ trip, user: target }, options);
        // Financial records and historical author identities survive membership removal.
        // Never delete User based on a racy absence-of-references query.
        return { hasExpenses: Boolean(expense || payment) };
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        timeoutMS: 15_000,
      }
    )
  );
}
