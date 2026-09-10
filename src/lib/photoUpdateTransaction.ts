import { mongo } from 'mongoose';

export class PhotoUpdateError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'NOT_FOUND') {
    super(code);
  }
}

/** The callback may retry: only transactional database writes belong here. */
export async function withPhotoUpdateTransaction<T>(
  db: mongo.Db,
  tripId: string,
  actorId: string,
  update: (session: mongo.ClientSession) => Promise<T>
): Promise<T> {
  const trip = new mongo.ObjectId(tripId);
  return db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const parent = await db.collection('trips').findOneAndUpdate(
          {
            _id: trip,
            members: { $elemMatch: { user: new mongo.ObjectId(actorId) } },
            expenseDeliveryDeleting: { $ne: true },
          },
          { $inc: { expenseDeliveryFence: 1 } },
          { session }
        );
        if (!parent) throw new PhotoUpdateError('FORBIDDEN');
        return update(session);
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
