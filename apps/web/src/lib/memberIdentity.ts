import { mongo } from 'mongoose';

export class MemberIdentityError extends Error {
  constructor(
    public readonly code:
      | 'NOT_TRIP_MEMBER'
      | 'NOT_VIRTUAL'
      | 'ALREADY_MEMBER'
      | 'INVALID_CREDENTIALS',
    public readonly status: number
  ) {
    super(code);
  }
}

/** Only database work in this callback: the driver may retry it. */
export async function changeMemberIdentity(
  db: mongo.Db,
  input: {
    tripId: string;
    virtualUserId: string;
    hashCode: string;
  } & (
    | { kind: 'link'; realUserId: string; passwordHash: string }
    | { kind: 'register'; username: string; displayName: string; email: string; password: string }
  )
) {
  const trip = new mongo.ObjectId(input.tripId);
  const virtual = new mongo.ObjectId(input.virtualUserId);
  return db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const options = { session };
        // A real parent write serializes claims, removal and background delivery; recheck the
        // capability too, so a link revoked while hashing credentials cannot claim membership.
        const parent = await db.collection('trips').findOneAndUpdate(
          {
            _id: trip,
            hashCode: input.hashCode,
            'members.user': virtual,
            expenseDeliveryDeleting: { $ne: true },
          },
          { $inc: { expenseDeliveryFence: 1 } },
          { ...options, returnDocument: 'after' }
        );
        if (!parent) throw new MemberIdentityError('NOT_TRIP_MEMBER', 400);
        const user = await db
          .collection('users')
          .findOneAndUpdate(
            { _id: virtual, isVirtual: true },
            { $inc: { expenseDeliveryFence: 1 } },
            options
          );
        if (!user) throw new MemberIdentityError('NOT_VIRTUAL', 400);
        if (input.kind === 'register') {
          await db.collection('users').updateOne(
            { _id: virtual },
            {
              $set: {
                username: input.username,
                displayName: input.displayName,
                email: input.email,
                password: input.password,
                isVirtual: false,
              },
            },
            options
          );
          return;
        }
        const real = new mongo.ObjectId(input.realUserId);
        if (parent.members.some((member: { user: mongo.ObjectId }) => member.user.equals(real)))
          throw new MemberIdentityError('ALREADY_MEMBER', 409);
        const authenticated = await db
          .collection('users')
          .updateOne(
            { _id: real, isVirtual: { $ne: true }, password: input.passwordHash },
            { $inc: { expenseDeliveryFence: 1 } },
            options
          );
        if (authenticated.matchedCount !== 1)
          throw new MemberIdentityError('INVALID_CREDENTIALS', 401);
        await db
          .collection('trips')
          .updateOne(
            { _id: trip, 'members.user': virtual },
            { $set: { 'members.$.user': real } },
            options
          );
        for (const [collection, field] of [
          ['expenses', 'payer'],
          ['payments', 'from'],
          ['payments', 'to'],
        ] as const) {
          await db
            .collection(collection)
            .updateMany({ trip, [field]: virtual }, { $set: { [field]: real } }, options);
        }
        await db
          .collection('expenses')
          .updateMany(
            { trip, 'splits.user': virtual },
            { $set: { 'splits.$[item].user': real } },
            { ...options, arrayFilters: [{ 'item.user': virtual }] }
          );
        await db
          .collection('checklists')
          .updateMany(
            { trip, 'items.assignee': virtual },
            { $set: { 'items.$[item].assignee': real } },
            { ...options, arrayFilters: [{ 'item.assignee': virtual }] }
          );
        await db.collection('checklists').updateMany(
          { trip, 'items.doneBy': virtual },
          [
            {
              $set: {
                items: {
                  $map: {
                    input: '$items',
                    as: 'item',
                    in: {
                      $mergeObjects: [
                        '$$item',
                        {
                          doneBy: {
                            $setUnion: [
                              {
                                $map: {
                                  input: { $ifNull: ['$$item.doneBy', []] },
                                  as: 'user',
                                  in: { $cond: [{ $eq: ['$$user', virtual] }, real, '$$user'] },
                                },
                              },
                              [],
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          ],
          options
        );
        await db.collection('notifications').deleteMany({ trip, user: virtual }, options);
        // Keep the virtual identity for historical authorship and references in other trips.
        // Deleting it based on a snapshot of references races writers outside this transaction.
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
