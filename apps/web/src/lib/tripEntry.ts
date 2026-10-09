import type { LedgerMutationRequest } from '@travel-budget/contracts';
import {
  parseLedgerInput,
  ledgerFingerprint,
  receiptStamp,
  terminalWithLedger,
  checkReceiptVersion,
  authorizeLedger,
  nonTwdCreationEnabled,
} from './ledger';
import { createHash, randomInt } from 'node:crypto';
import { mongo } from 'mongoose';
import {
  tripCreateInput,
  tripJoinInput,
  type TripCreateInput,
  type TripJoinInput,
  type MutationRequest,
  type TripMutationResult,
} from '@travel-budget/contracts';

export const MUTATION_REQUESTS = 'mutationrequests';
type Operation = 'trip.create' | 'trip.join';
type Terminal = Exclude<MutationRequest | LedgerMutationRequest, { status: 'not_found' }>;
interface Receipt {
  _id: string;
  fingerprint: string;
  contractVersion?: number;
  terminal: Terminal;
  createdAt: Date;
}
interface Parent {
  _id: mongo.ObjectId;
  name: string;
  hashCode: string;
  baseCurrency?: string;
  members: { user: mongo.ObjectId; role: string; joinedAt?: Date }[];
}
export class TripEntryError extends Error {
  constructor(
    public code:
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'IDEMPOTENCY_CONFLICT'
      | 'INVITATION_INVALID'
      | 'BUSY'
      | 'SETTLEMENT_CHANGED'
      | 'RESOURCE_CHANGED'
      | 'RESOURCE_GONE'
      | 'VALIDATION_ERROR'
      | 'LEDGER_CURRENCY_MISMATCH'
      | 'FEATURE_NOT_AVAILABLE'
      | 'CLIENT_UPGRADE_REQUIRED'
  ) {
    super(code);
  }
}
const keyOf = (actor: string, key: string) => `${actor.toLowerCase()}:${key.toLowerCase()}`;
const fingerprint = (operation: Operation, input: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(ledgerFingerprint({ operation, input })))
    .digest('hex');
const code = () =>
  Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[randomInt(36)]).join('');
const memberFilter = (actorId: string) => ({
  'members.user': new mongo.ObjectId(actorId),
  expenseDeliveryDeleting: { $ne: true },
});
const txOptions = {
  readConcern: { level: 'snapshot' as const },
  writeConcern: { w: 'majority' as const },
  readPreference: 'primary' as const,
  timeoutMS: 20_000,
};

async function authorizeReceipt(
  db: mongo.Db,
  session: mongo.ClientSession,
  actorId: string,
  terminal: Terminal
) {
  if (terminal.status === 'rejected' && !terminal.tripId) return;
  // Actor UUID namespace only: an exit receipt contains no roster or invitation.
  if (
    terminal.status === 'committed' &&
    terminal.operation === 'trip.access' &&
    'exited' in terminal.result &&
    terminal.result.exited
  )
    return;
  const tripId =
    terminal.status === 'rejected'
      ? terminal.tripId!
      : !terminal.operation.startsWith('trip.')
        ? terminal.result.tripId
        : terminal.resourceId;
  const trip = await db
    .collection<Parent>('trips')
    .findOneAndUpdate(
      { _id: new mongo.ObjectId(tripId), ...memberFilter(actorId) },
      { $inc: { expenseDeliveryFence: 1 } },
      { session }
    );
  if (!trip) throw new TripEntryError('NOT_FOUND');
  authorizeLedger(trip);
}

/** Account UUID index is Mongo's built-in unique _id. No receipt TTL or resource cascade. */
export async function readTripMutation(
  db: mongo.Db,
  actorId: string,
  key: string
): Promise<MutationRequest | LedgerMutationRequest> {
  return db.client.withSession((session) =>
    session.withTransaction(async () => {
      const receipt = await db
        .collection<Receipt>(MUTATION_REQUESTS)
        .findOne({ _id: keyOf(actorId, key) }, { session });
      if (!receipt) return { status: 'not_found' as const };
      await authorizeReceipt(db, session, actorId, receipt.terminal);
      checkReceiptVersion(receipt);
      return receipt.terminal;
    }, txOptions)
  );
}

export interface JoinDelivery {
  recipients: string[];
  byId: Map<string, { email?: string; notifyByEmail?: boolean; locale?: string }>;
  type: 'member_joined';
  tripHashCode: string;
  tripName: string;
  actorName: string;
  meta: Record<string, never>;
}
async function persistJoinEffects(
  db: mongo.Db,
  session: mongo.ClientSession,
  trip: Parent,
  actorId: string
): Promise<JoinDelivery> {
  const users = await db
    .collection<{
      _id: mongo.ObjectId;
      displayName: string;
      isVirtual?: boolean;
      email?: string;
      notifyByEmail?: boolean;
      locale?: string;
    }>('users')
    .find(
      { _id: { $in: trip.members.map((m) => m.user) } },
      {
        session,
        projection: { displayName: 1, isVirtual: 1, email: 1, notifyByEmail: 1, locale: 1 },
      }
    )
    .toArray();
  const actorName = users.find((u) => u._id.toString() === actorId)?.displayName ?? '';
  const recipients = users.filter((u) => u._id.toString() !== actorId && !u.isVirtual);
  const common = {
    trip: trip._id,
    actor: new mongo.ObjectId(actorId),
    actorName,
    type: 'member_joined',
    meta: {},
    createdAt: new Date(),
  };
  // The driver adds _id to its input; keep the notification template untouched.
  await db.collection('activitylogs').insertOne({ ...common }, { session });
  if (recipients.length)
    await db.collection('notifications').insertMany(
      recipients.map((u) => ({ ...common, user: u._id, tripName: trip.name, read: false })),
      { session }
    );
  return {
    recipients: recipients.map((u) => u._id.toString()),
    byId: new Map(users.map((u) => [u._id.toString(), u])),
    type: 'member_joined',
    tripHashCode: trip.hashCode,
    tripName: trip.name,
    actorName,
    meta: {},
  };
}

/** No external effects inside retryable DB work. The adapters deliver only a newly committed join. */
export async function enterTrip(
  db: mongo.Db,
  actorId: string,
  operation: Operation,
  body: unknown,
  deliver: (event: JoinDelivery) => Promise<unknown> = async () => undefined,
  webDestination?: unknown
): Promise<TripMutationResult> {
  const input =
    operation === 'trip.create'
      ? parseLedgerInput(tripCreateInput, body)
      : parseLedgerInput(tripJoinInput, body);
  const id = keyOf(actorId, input.client_request_id);
  const hash = fingerprint(operation, { ...input, ...(webDestination ? { webDestination } : {}) });
  // Unique receipt races and invitation-code collisions abort the whole transaction before retry.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const accepted = await db.client.withSession((session) =>
        session.withTransaction(async () => {
          const receipts = db.collection<Receipt>(MUTATION_REQUESTS);
          const existing = await receipts.findOne({ _id: id }, { session });
          if (existing) {
            checkReceiptVersion(existing);
            await authorizeReceipt(db, session, actorId, existing.terminal);
            if (existing.fingerprint !== hash) throw new TripEntryError('IDEMPOTENCY_CONFLICT');
            return { terminal: existing.terminal, delivery: undefined };
          }
          let terminal: Terminal;
          let delivery: JoinDelivery | undefined;
          if (operation === 'trip.create') {
            const fields = input as TripCreateInput;
            const requestedBase = (input as TripCreateInput & { base_currency: string })
              .base_currency;
            authorizeLedger({ baseCurrency: requestedBase });
            if (requestedBase !== 'TWD' && !nonTwdCreationEnabled()) {
              const terminal = {
                status: 'rejected' as const,
                operation,
                code: 'FEATURE_NOT_AVAILABLE' as const,
              };
              await receipts.insertOne(
                {
                  _id: id,
                  fingerprint: hash,
                  ...receiptStamp(),
                  terminal: terminalWithLedger(terminal),
                  createdAt: new Date(),
                },
                { session }
              );
              return { terminal, delivery: undefined };
            }
            const tripId = new mongo.ObjectId();
            await db.collection('trips').insertOne(
              {
                _id: tripId,
                baseCurrency: requestedBase,
                name: fields.name,
                description: fields.description,
                ...(fields.start_date ? { startDate: new Date(fields.start_date) } : {}),
                ...(fields.end_date ? { endDate: new Date(fields.end_date) } : {}),
                ...(webDestination ? { destinationLocation: webDestination } : {}),
                hashCode: code(),
                members: [
                  {
                    user: new mongo.ObjectId(actorId),
                    role: 'admin',
                    joinedAt: new Date(),
                    archivedAt: null,
                    budget: null,
                  },
                ],
                legacyBudget: null,
                currencySettings: null,
                createdAt: new Date(),
              },
              { session }
            );
            terminal = {
              status: 'committed',
              operation,
              resourceId: tripId.toHexString(),
              result: { tripId: tripId.toHexString() },
            };
          } else {
            const trip = await db.collection<Parent>('trips').findOneAndUpdate(
              {
                hashCode: (input as TripJoinInput).invite_code,
                expenseDeliveryDeleting: { $ne: true },
              },
              { $inc: { expenseDeliveryFence: 1 } },
              { session }
            );
            if (!trip) terminal = { status: 'rejected', operation, code: 'INVITATION_INVALID' };
            else {
              authorizeLedger(trip);
              const alreadyMember = trip.members.some((m) => m.user.toString() === actorId);
              if (!alreadyMember) {
                const member = {
                  user: new mongo.ObjectId(actorId),
                  role: 'member',
                  joinedAt: new Date(),
                  archivedAt: null,
                  budget: null,
                };
                await db
                  .collection<Parent>('trips')
                  .updateOne({ _id: trip._id }, { $push: { members: member } }, { session });
                trip.members.push(member);
                delivery = await persistJoinEffects(db, session, trip, actorId);
              }
              terminal = {
                status: 'committed',
                operation,
                resourceId: trip._id.toHexString(),
                result: { tripId: trip._id.toHexString(), alreadyMember },
              };
            }
          }
          await receipts.insertOne(
            {
              _id: id,
              fingerprint: hash,
              ...receiptStamp(),
              terminal: terminalWithLedger(terminal),
              createdAt: new Date(),
            },
            { session }
          );
          return { terminal, delivery };
        }, txOptions)
      );
      if (accepted.terminal.status === 'rejected') throw new TripEntryError(accepted.terminal.code);
      // External failure never changes committed success, and a replay never schedules again.
      if (accepted.delivery)
        await Promise.resolve()
          .then(() => deliver(accepted.delivery!))
          .catch(() => undefined);
      return terminalWithLedger(accepted.terminal).result as TripMutationResult;
    } catch (error) {
      if ((error as { code?: number })?.code === 11000 && attempt < 9) continue;
      throw error;
    }
  }
  throw new TripEntryError('BUSY');
}
