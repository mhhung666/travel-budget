import { mongo } from 'mongoose';

export class TripDeletionError extends Error {}

export const TRIP_CHILD_COLLECTIONS = [
  'expenses',
  'expensecreaterequests',
  'itinerarydays',
  'payments',
  'checklists',
  'notifications',
  'activitylogs',
  'comments',
  'notes',
  'photos',
] as const;

/** Sequential inside transactions; also used by the delayed cleanup sweep for late writers. */
export async function clearTripChildren(
  db: mongo.Db,
  trip: mongo.ObjectId,
  session?: mongo.ClientSession
) {
  for (const name of TRIP_CHILD_COLLECTIONS)
    await db.collection(name).deleteMany({ trip }, { session });
  for (const name of ['flightrecords', 'stayrecords'])
    await db.collection(name).updateMany({ trip }, { $set: { trip: null } }, { session });
  await db
    .collection('aiimportusages')
    .deleteMany({ scope: 'trip', scopeKey: trip.toHexString() }, { session });
}

export async function deleteTripAtomically(db: mongo.Db, tripId: string, actorId: string) {
  const trip = new mongo.ObjectId(tripId);
  const actor = new mongo.ObjectId(actorId);
  await db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const parent = await db
          .collection('trips')
          .findOneAndUpdate(
            { _id: trip, members: { $elemMatch: { user: actor, role: 'admin' } } },
            { $set: { expenseDeliveryDeleting: true }, $inc: { expenseDeliveryFence: 1 } },
            { session }
          );
        if (!parent) throw new TripDeletionError('FORBIDDEN');
        // The job survives the parent. No external storage operation runs before commit.
        await db.collection('tripcleanupjobs').updateOne(
          { _id: trip },
          {
            $setOnInsert: {
              createdAt: new Date(),
              availableAt: new Date(),
              attempts: 0,
              prefixIndex: 0,
            },
          },
          { session, upsert: true }
        );
        await clearTripChildren(db, trip, session);
        await db.collection('trips').deleteOne({ _id: trip }, { session });
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        timeoutMS: 20_000,
      }
    )
  );
}
