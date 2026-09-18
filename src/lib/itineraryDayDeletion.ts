import { retireUnreferencedBlobs } from './blobReferences';
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
        // 不重新編號：Day N 代表出發後第 N 天，刪掉中間一天不該讓後續行程的日期前移。
        // 空出的 dayNumber 重新成為可新增的目標（見 lib/itineraryDayTarget.ts）。
        await rebindAutoPhotosInTransaction(
          db,
          session,
          trip,
          { startDate: parent.startDate, endDate: parent.endDate },
          now
        );
        const keys = [
          ...new Set<string>(
            (removed.activities ?? []).flatMap((activity: { attachments?: { key: string }[] }) =>
              (activity.attachments ?? []).map((attachment) => attachment.key)
            )
          ),
        ];
        await retireUnreferencedBlobs(db, session, tripId, keys);
        return keys;
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
