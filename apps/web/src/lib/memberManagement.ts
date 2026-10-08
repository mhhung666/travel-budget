import type { LedgerMutationRequest } from '@travel-budget/contracts';
import {
  ledgerRevision,
  parseLedgerInput,
  ledgerFingerprint,
  receiptStamp,
  terminalWithLedger,
  checkReceiptVersion,
} from './ledger';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import {
  tripMembersSchema,
  virtualMemberCreateInput,
  virtualMemberNameSchema,
  type TripMembers,
  type VirtualMemberCreateInput,
  type MemberMutationResult,
  type MutationRequest,
} from '@travel-budget/contracts';
import { withTripWriteInDatabase } from './tripWriteTransaction';
import { TripEntryError, MUTATION_REQUESTS } from './tripEntry';

type Parent = {
  _id: mongo.ObjectId;
  members: { user: mongo.ObjectId; role?: 'admin' | 'member'; joinedAt?: Date }[];
};
type Person = { _id: mongo.ObjectId; displayName: string; isVirtual?: boolean };
export async function roster(
  db: mongo.Db,
  session: mongo.ClientSession,
  actorId: string,
  tripId: string,
  secret: string
): Promise<TripMembers> {
  const trip = await db
    .collection<Parent>('trips')
    .findOne({ _id: new mongo.ObjectId(tripId) }, { session });
  if (!trip) throw new TripEntryError('NOT_FOUND');
  const users = await db
    .collection<Person>('users')
    .find(
      { _id: { $in: trip.members.map((m) => m.user) } },
      { session, projection: { displayName: 1, isVirtual: 1 } }
    )
    .toArray();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const members = trip.members
    .filter((m) => byId.has(m.user.toString()))
    .map((m) => ({
      id: m.user.toString(),
      displayName: byId.get(m.user.toString())!.displayName,
      isVirtual: byId.get(m.user.toString())!.isVirtual === true,
      role: m.role ?? 'member',
      joinedAt: m.joinedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => (a.joinedAt ?? '').localeCompare(b.joinedAt ?? ''));
  return tripMembersSchema.parse({
    tripId,
    role: trip.members.find((m) => m.user.toString() === actorId)!.role ?? 'member',
    members,
    revision: createHmac('sha256', secret)
      .update(JSON.stringify(ledgerRevision({ domain: 'members/v1', tripId, members })))
      .digest('hex'),
  });
}
export function readTripMembers(db: mongo.Db, actorId: string, tripId: string, secret: string) {
  return withTripWriteInDatabase(db, tripId, actorId, (session) =>
    roster(db, session, actorId, tripId, secret)
  );
}
/** Shared Web/Mobile virtual creation. No effects in a retryable transaction. */
async function createVirtual(
  db: mongo.Db,
  session: mongo.ClientSession,
  tripId: string,
  displayName: string
) {
  const id = new mongo.ObjectId(),
    username = `virtual_${randomUUID()}`,
    joinedAt = new Date();
  await db.collection('users').insertOne(
    {
      _id: id,
      username,
      displayName,
      email: `${username}@virtual.local`,
      password: randomUUID(),
      isVirtual: true,
      notifyByEmail: true,
      locale: 'zh',
      createdAt: joinedAt,
    },
    { session }
  );
  await db
    .collection<Parent>('trips')
    .updateOne(
      { _id: new mongo.ObjectId(tripId) },
      { $push: { members: { user: id, role: 'member', joinedAt } } },
      { session }
    );
  return {
    id: id.toString(),
    username,
    display_name: displayName,
    avatar_url: null,
    is_virtual: true,
    joined_at: joinedAt.toISOString(),
    role: 'member' as const,
  };
}
export function createVirtualMemberForActor(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  name: string
) {
  const displayName = virtualMemberNameSchema.parse(name);
  return withTripWriteInDatabase(
    db,
    tripId,
    actorId,
    (session) => createVirtual(db, session, tripId, displayName),
    'admin'
  );
}
type Terminal = Exclude<MutationRequest | LedgerMutationRequest, { status: 'not_found' }>;
interface Receipt {
  _id: string;
  fingerprint: string;
  contractVersion?: number;
  terminal: Terminal;
  createdAt: Date;
}
export async function manageMember(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  operation: 'member.create' | 'member.rename',
  body: VirtualMemberCreateInput,
  secret: string,
  memberId?: string
): Promise<MemberMutationResult> {
  actorId = actorId.toLowerCase();
  tripId = tripId.toLowerCase();
  memberId = memberId?.toLowerCase();
  const input = parseLedgerInput(virtualMemberCreateInput, body);
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify(ledgerFingerprint({ operation, tripId, memberId: memberId ?? null, input }))
    )
    .digest('hex');
  const key = `${actorId.toLowerCase()}:${input.client_request_id}`;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const terminal = await withTripWriteInDatabase(db, tripId, actorId, async (session) => {
        const receipts = db.collection<Receipt>(MUTATION_REQUESTS);
        const previous = await receipts.findOne({ _id: key }, { session });
        if (previous) {
          checkReceiptVersion(previous);
          if (previous.fingerprint !== fingerprint)
            throw new TripEntryError('IDEMPOTENCY_CONFLICT');
          return previous.terminal;
        }
        const current = await roster(db, session, actorId, tripId, secret);
        const reject = (code: 'FORBIDDEN' | 'RESOURCE_CHANGED' | 'RESOURCE_GONE'): Terminal => ({
          status: 'rejected',
          operation,
          tripId,
          code,
        });
        let outcome: Terminal;
        const target = current.members.find((m) => m.id === memberId);
        if (current.role !== 'admin') outcome = reject('FORBIDDEN');
        else if (operation === 'member.rename' && (!target || !target.isVirtual))
          outcome = reject('RESOURCE_GONE');
        else if (current.revision !== input.expected_revision) outcome = reject('RESOURCE_CHANGED');
        else {
          let changedId: string;
          if (operation === 'member.create')
            changedId = (await createVirtual(db, session, tripId, input.display_name)).id;
          else {
            changedId = target!.id;
            // The user write also serializes a claim/conversion from another trip.
            const changed = await db
              .collection<Person>('users')
              .updateOne(
                { _id: new mongo.ObjectId(changedId), isVirtual: true },
                { $set: { displayName: input.display_name }, $inc: { expenseDeliveryFence: 1 } },
                { session }
              );
            if (changed.matchedCount !== 1) throw new TripEntryError('RESOURCE_GONE');
          }
          const next = await roster(db, session, actorId, tripId, secret);
          outcome = {
            status: 'committed',
            operation,
            resourceId: changedId,
            result: { tripId, memberId: changedId, revision: next.revision },
          };
        }
        await receipts.insertOne(
          {
            _id: key,
            fingerprint,
            ...receiptStamp(),
            terminal: terminalWithLedger(outcome),
            createdAt: new Date(),
          },
          { session }
        );
        return outcome;
      });
      if (terminal.status === 'rejected') throw new TripEntryError(terminal.code);
      return terminal.result as MemberMutationResult;
    } catch (error) {
      if ((error as { code?: number })?.code === 11000 && attempt < 9) continue;
      throw error;
    }
  }
  throw new TripEntryError('BUSY');
}
