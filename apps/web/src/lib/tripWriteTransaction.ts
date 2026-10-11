import mongoose, { mongo } from 'mongoose';
import { dbConnect } from './mongodb';
import { authorizeLedger, validateLedgerChildren } from './ledger';

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
  return withTripWriteInDatabase(db, tripId, actorId, write, role);
}

/** Same fence and transaction for raw DB services and model-backed Web writers. */
export async function withTripWriteInDatabase<T>(
  db: mongo.Db,
  tripId: string,
  actorId: string,
  write: (session: mongo.ClientSession) => Promise<T>,
  role?: 'admin'
): Promise<T> {
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
        authorizeLedger(parent);
        await validateLedgerChildren(db, parent, session);
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

/** Membership and financial context from one consistent snapshot, without a write fence. */
export async function withTripReadInDatabase<T>(
  db: mongo.Db,
  tripId: string,
  actorId: string,
  read: (session: mongo.ClientSession, options: () => mongo.FindOptions) => Promise<T>,
  cursorReads = false
): Promise<T> {
  // Driver 7.2's transaction CSOT leaks maxTimeMS onto non-awaitData getMore.
  // For full cursor reads, use public per-operation CSOT against ONE absolute deadline,
  // including explicit commit. Keep withTransaction retry, membership and snapshot isolation.
  const deadline = performance.now() + 20_000;
  const remaining = () => {
    const ms = Math.ceil(deadline - performance.now());
    if (ms <= 0) throw new mongo.MongoOperationTimeoutError('Trip read deadline exceeded');
    return ms;
  };
  return db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const options = () => ({ session, ...(cursorReads ? { timeoutMS: remaining() } : {}) });
        try {
          const parent = await db.collection('trips').findOne(
            {
              _id: new mongo.ObjectId(tripId),
              'members.user': new mongo.ObjectId(actorId),
              expenseDeliveryDeleting: { $ne: true },
            },
            options()
          );
          if (!parent) throw new TripWriteError('FORBIDDEN');
          authorizeLedger(parent);
          await validateLedgerChildren(db, parent, session, cursorReads ? options : undefined);
          const result = await read(session, options);
          if (cursorReads) await session.commitTransaction({ timeoutMS: remaining() });
          return result;
        } catch (error) {
          if (cursorReads && error instanceof mongo.MongoError && session.inTransaction())
            await session.abortTransaction({
              timeoutMS: Math.max(1, Math.ceil(deadline - performance.now())),
            });
          throw error;
        }
      },
      {
        readConcern: { level: 'snapshot' },
        readPreference: 'primary',
        ...(cursorReads ? {} : { timeoutMS: 20_000 }),
      }
    )
  );
}
