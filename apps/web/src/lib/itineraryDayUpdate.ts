import { mongo } from 'mongoose';
import type { TripTransactionOptions } from './tripWriteTransaction';

export type ItineraryWriteContext = {
  session: mongo.ClientSession;
  parent: { startDate?: Date; endDate?: Date };
  cleanupKeys: string[];
  options: () => TripTransactionOptions;
};

export class ItineraryDayUpdateError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'CONFLICT' | 'DAY_ALREADY_EXISTS' | 'DATE_OUTSIDE_TRIP'
  ) {
    super(code);
  }
}

/** The callback may retry: only transactional database writes belong here. */
export async function withItineraryDayUpdateTransaction<T>(
  db: mongo.Db,
  tripId: string,
  actorId: string,
  update: (
    session: mongo.ClientSession,
    parent: { startDate?: Date; endDate?: Date }
  ) => Promise<T>,
  context?: ItineraryWriteContext
): Promise<T> {
  if (context) return update(context.session, context.parent);
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
