import { mongo } from 'mongoose';

export class ItineraryDayUpdateError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'CONFLICT') {
    super(code);
  }
}

/** The callback may retry: only transactional database writes belong here. */
export async function withItineraryDayUpdateTransaction<T>(
  db: mongo.Db,
  tripId: string,
  actorId: string,
  update: (session: mongo.ClientSession, parent: { startDate?: Date; endDate?: Date }) => Promise<T>
): Promise<T> {
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
        if (!parent) throw new ItineraryDayUpdateError('FORBIDDEN');
        return update(session, { startDate: parent.startDate, endDate: parent.endDate });
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
