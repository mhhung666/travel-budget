import mongoose, { mongo } from 'mongoose';
import { dbConnect } from './mongodb';

export class TripWriteError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'CONFLICT') {
    super(code);
  }
}

/** Retry only database work. Resolve external uploads before entering; deliver effects afterwards. */
export async function withTripWrite<T>(
  tripId: string,
  actorId: string,
  write: (session: mongo.ClientSession) => Promise<T>,
  role?: 'admin'
): Promise<T> {
  await dbConnect();
  const db = mongoose.connection.db!;
  return db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const parent = await db.collection('trips').findOneAndUpdate(
          {
            _id: new mongo.ObjectId(tripId),
            members: {
              $elemMatch: { user: new mongo.ObjectId(actorId), ...(role ? { role } : {}) },
            },
            expenseDeliveryDeleting: { $ne: true },
          },
          { $inc: { expenseDeliveryFence: 1 } },
          { session }
        );
        if (!parent) throw new TripWriteError('FORBIDDEN');
        return write(session);
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
