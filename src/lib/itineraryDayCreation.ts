import { mongo } from 'mongoose';
import { ItineraryDay } from '@/models';
import { rebindAutoPhotosInTransaction } from '@/lib/photoItineraryTransaction';

export class ItineraryDayCreationError extends Error {
  constructor(public readonly code: 'FORBIDDEN') {
    super(code);
  }
}

/** Attachment HEAD checks must finish before entering this retryable transaction. */
export async function createItineraryDayAtomically(
  db: mongo.Db,
  tripId: string,
  actorId: string,
  input: {
    title: string;
    content: string;
    location: unknown;
    activities: Record<string, unknown>[];
  }
) {
  const trip = new mongo.ObjectId(tripId);
  return db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const parent = await db.collection('trips').findOneAndUpdate(
          {
            _id: trip,
            members: { $elemMatch: { user: new mongo.ObjectId(actorId), role: 'admin' } },
            expenseDeliveryDeleting: { $ne: true },
          },
          { $inc: { expenseDeliveryFence: 1 } },
          { session }
        );
        if (!parent) throw new ItineraryDayCreationError('FORBIDDEN');
        const last = await db
          .collection('itinerarydays')
          .findOne({ trip }, { session, sort: { dayNumber: -1 }, projection: { dayNumber: 1 } });
        // Construct anew on retries; retain Mongoose casting, validation and subdocument defaults.
        const created = new ItineraryDay({ ...input, trip, dayNumber: (last?.dayNumber ?? 0) + 1 });
        await created.save({ session });
        await rebindAutoPhotosInTransaction(
          db,
          session,
          trip,
          { startDate: parent.startDate, endDate: parent.endDate },
          new Date()
        );
        return created.toObject();
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
