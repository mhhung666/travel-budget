import { mongo } from 'mongoose';
import { rebindAutoPhotosInTransaction } from '@/lib/photoItineraryTransaction';

export class ItineraryDayDeletionError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'NOT_FOUND') {
    super(code);
  }
}

/** All database effects commit together; the caller may clean ticket blobs only after commit. */
export async function deleteItineraryDayAtomically(
  db: mongo.Db,
  tripId: string,
  actorId: string,
  dayId: string
): Promise<string[]> {
  const trip = new mongo.ObjectId(tripId);
  const day = new mongo.ObjectId(dayId);
  return db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const now = new Date();
        const parent = await db.collection('trips').findOneAndUpdate(
          {
            _id: trip,
            members: { $elemMatch: { user: new mongo.ObjectId(actorId), role: 'admin' } },
            expenseDeliveryDeleting: { $ne: true },
          },
          { $inc: { expenseDeliveryFence: 1 } },
          { session }
        );
        if (!parent) throw new ItineraryDayDeletionError('FORBIDDEN');
        const removed = await db
          .collection('itinerarydays')
          .findOneAndDelete({ _id: day, trip }, { session });
        if (!removed) throw new ItineraryDayDeletionError('NOT_FOUND');
        await db
          .collection<{
            trip: mongo.ObjectId;
            itineraryDays: mongo.ObjectId[];
            updatedAt?: Date;
          }>('expenses')
          .updateMany(
            { trip, itineraryDays: day },
            { $pull: { itineraryDays: day }, $max: { updatedAt: now } },
            { session }
          );
        await db
          .collection('photos')
          .updateMany(
            { trip, itineraryDay: day, 'location.source': 'itinerary' },
            { $set: { location: null }, $max: { updatedAt: now } },
            { session }
          );
        await db
          .collection('photos')
          .updateMany(
            { trip, itineraryDay: day },
            { $set: { itineraryDay: null }, $max: { updatedAt: now } },
            { session }
          );
        const remaining = await db
          .collection('itinerarydays')
          .find({ trip }, { session, projection: { dayNumber: 1, location: 1 } })
          .sort({ dayNumber: 1 })
          .toArray();
        // Ascending writes free each unique (trip, dayNumber) slot before the next uses it.
        for (const [index, item] of remaining.entries()) {
          const dayNumber = index + 1;
          if (item.dayNumber === dayNumber) continue;
          await db
            .collection('itinerarydays')
            .updateOne(
              { _id: item._id, trip },
              { $set: { dayNumber }, $inc: { revision: 1 }, $max: { updatedAt: now } },
              { session }
            );
          item.dayNumber = dayNumber;
        }
        await rebindAutoPhotosInTransaction(
          db,
          session,
          trip,
          { startDate: parent.startDate, endDate: parent.endDate },
          now
        );
        return [
          ...new Set<string>(
            (removed.activities ?? []).flatMap((activity: { attachments?: { key: string }[] }) =>
              (activity.attachments ?? []).map((attachment) => attachment.key)
            )
          ),
        ];
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
