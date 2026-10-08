import type { LedgerMutationRequest } from '@travel-budget/contracts';
import {
  ledgerRevision,
  parseLedgerInput,
  ledgerFingerprint,
  receiptStamp,
  terminalWithLedger,
  checkReceiptVersion,
} from './ledger';
import { createHash, createHmac } from 'node:crypto';
import { mongo } from 'mongoose';
import {
  tripAccessInput,
  type TripAccessInput,
  type TripAccessContext,
  type TripAccessResult,
  type MutationRequest,
} from '@travel-budget/contracts';
import { withTripWriteInDatabase } from './tripWriteTransaction';
import { roster } from './memberManagement';
import { removeMemberInTransaction } from './memberRemoval';
import { deleteTripInTransaction, TRIP_CHILD_COLLECTIONS } from './tripDeletion';
import { MUTATION_REQUESTS, TripEntryError } from './tripEntry';

type Terminal = Exclude<MutationRequest | LedgerMutationRequest, { status: 'not_found' }>;
type Receipt = {
  _id: string;
  fingerprint: string;
  contractVersion?: number;
  terminal: Terminal;
  createdAt: Date;
};
/** Include every deleted document in the opaque confirmation revision. Never return private data. */
async function context(
  db: mongo.Db,
  session: mongo.ClientSession,
  actorId: string,
  tripId: string,
  secret: string
): Promise<TripAccessContext> {
  const members = await roster(db, session, actorId, tripId, secret);
  const trip = new mongo.ObjectId(tripId);
  const parent = await db.collection('trips').findOne({ _id: trip }, { session });
  if (!parent) throw new TripEntryError('NOT_FOUND');
  const { expenseDeliveryFence: _fence, ...fields } = parent;
  const hash = createHmac('sha256', secret).update(
    JSON.stringify(ledgerRevision({ domain: 'trip-access/v1', fields, members }))
  );
  let expenseCount = 0,
    paymentCount = 0;
  for (const name of [...TRIP_CHILD_COLLECTIONS, 'flightrecords', 'stayrecords']) {
    const documents = await db
      .collection(name)
      .find({ trip }, { session })
      .sort({ _id: 1 })
      .toArray();
    hash.update(JSON.stringify({ name, documents }));
    if (name === 'expenses') expenseCount = documents.length;
    if (name === 'payments') paymentCount = documents.length;
  }
  // A virtual admin cannot take over management: require another usable real admin.
  const canLeave =
    members.role !== 'admin' ||
    members.members.some((m) => m.id !== actorId && m.role === 'admin' && !m.isVirtual);
  return {
    ...members,
    name: typeof parent.name === 'string' ? parent.name : '',
    accessRevision: hash.digest('hex'),
    expenseCount,
    paymentCount,
    canLeave,
  };
}
export function readTripAccess(db: mongo.Db, actorId: string, tripId: string, secret: string) {
  return withTripWriteInDatabase(db, tripId, actorId, (session) =>
    context(db, session, actorId, tripId, secret)
  );
}
/** Also used by Web. Changing one's own role remains forbidden. */
export async function roleInTransaction(
  db: mongo.Db,
  session: mongo.ClientSession,
  tripId: string,
  actorId: string,
  memberId: string,
  role: 'admin' | 'member'
) {
  actorId = actorId.toLowerCase();
  memberId = memberId.toLowerCase();
  tripId = tripId.toLowerCase();
  if (actorId === memberId) throw new TripEntryError('VALIDATION_ERROR');
  const result = await db
    .collection('trips')
    .updateOne(
      { _id: new mongo.ObjectId(tripId), 'members.user': new mongo.ObjectId(memberId) },
      { $set: { 'members.$.role': role } },
      { session }
    );
  if (result.matchedCount !== 1) throw new TripEntryError('RESOURCE_GONE');
}
export function changeRoleForActor(
  db: mongo.Db,
  tripId: string,
  actorId: string,
  memberId: string,
  role: 'admin' | 'member'
) {
  return withTripWriteInDatabase(
    db,
    tripId,
    actorId,
    (session) => roleInTransaction(db, session, tripId, actorId, memberId, role),
    'admin'
  );
}
/** Receipt replay is allowed without membership ONLY for the actor's own successful exit. */
export async function manageTripAccess(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  body: TripAccessInput,
  secret: string
): Promise<TripAccessResult> {
  actorId = actorId.toLowerCase();
  tripId = tripId.toLowerCase();
  const input = parseLedgerInput(tripAccessInput, body);
  const key = `${actorId}:${input.client_request_id}`;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(ledgerFingerprint({ tripId, input })))
    .digest('hex');
  const replay = (receipt: Receipt) => {
    checkReceiptVersion(receipt);
    if (receipt.fingerprint !== fingerprint) throw new TripEntryError('IDEMPOTENCY_CONFLICT');
    if (receipt.terminal.status === 'rejected') throw new TripEntryError(receipt.terminal.code);
    return receipt.terminal.result as TripAccessResult;
  };
  const previous = await db.collection<Receipt>(MUTATION_REQUESTS).findOne({ _id: key });
  if (
    previous?.terminal.status === 'committed' &&
    previous.terminal.operation === 'trip.access' &&
    'exited' in previous.terminal.result &&
    previous.terminal.result.exited
  )
    return replay(previous);
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const terminal = await withTripWriteInDatabase(db, tripId, actorId, async (session) => {
        const receipts = db.collection<Receipt>(MUTATION_REQUESTS);
        const existing = await receipts.findOne({ _id: key }, { session });
        if (existing) {
          checkReceiptVersion(existing);
          replay(existing);
          return existing.terminal;
        }
        const current = await context(db, session, actorId, tripId, secret);
        const target =
          'member_id' in input ? current.members.find((m) => m.id === input.member_id) : undefined;
        let rejection:
          | 'FORBIDDEN'
          | 'RESOURCE_GONE'
          | 'RESOURCE_CHANGED'
          | 'VALIDATION_ERROR'
          | undefined;
        if (input.action !== 'leave' && current.role !== 'admin') rejection = 'FORBIDDEN';
        else if ('member_id' in input && input.member_id === actorId)
          rejection = 'VALIDATION_ERROR';
        else if ('member_id' in input && !target) rejection = 'RESOURCE_GONE';
        else if (input.action === 'leave' && !current.canLeave) rejection = 'VALIDATION_ERROR';
        else if (input.expected_revision !== current.accessRevision) rejection = 'RESOURCE_CHANGED';
        let outcome: Terminal;
        if (rejection)
          outcome = { status: 'rejected', operation: 'trip.access', tripId, code: rejection };
        else {
          const trip = new mongo.ObjectId(tripId);
          if (input.action === 'role')
            await roleInTransaction(db, session, tripId, actorId, input.member_id, input.role);
          if (input.action === 'remove' || input.action === 'leave') {
            const parent = await db.collection('trips').findOne({ _id: trip }, { session });
            await removeMemberInTransaction(
              db,
              session,
              trip,
              new mongo.ObjectId(input.action === 'leave' ? actorId : input.member_id),
              parent!.members
            );
          }
          if (input.action === 'delete') await deleteTripInTransaction(db, session, trip);
          outcome = {
            status: 'committed',
            operation: 'trip.access',
            resourceId: tripId,
            result: {
              tripId,
              action: input.action,
              exited: input.action === 'leave' || input.action === 'delete',
            },
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
      return replay({
        _id: key,
        fingerprint,
        ...receiptStamp(),
        terminal: terminalWithLedger(terminal),
        createdAt: new Date(),
      });
    } catch (error) {
      if ((error as { code?: number })?.code === 11000 && attempt < 9) continue;
      // A concurrent successful exit removed the parent before the duplicate acquired its fence.
      const committed = await db.collection<Receipt>(MUTATION_REQUESTS).findOne({ _id: key });
      if (
        committed?.terminal.status === 'committed' &&
        committed.terminal.operation === 'trip.access' &&
        'exited' in committed.terminal.result &&
        committed.terminal.result.exited
      )
        return replay(committed);
      throw error;
    }
  }
  throw new TripEntryError('BUSY');
}
