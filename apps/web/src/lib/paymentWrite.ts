import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import {
  paymentContextSchema,
  paymentRevokeContextSchema,
  paymentCreateInput,
  paymentDeleteInput,
  type PaymentContext,
  type PaymentRevokeContext,
  type PaymentCreateInput,
  type PaymentDeleteInput,
  type PaymentMutationResult,
  type MutationRequest,
} from '@travel-budget/contracts';
import { calculateSettlementDetail } from './settlementRead';
import { toMobileSettlement } from './mobile/settlement';
import { withTripWriteInDatabase } from './tripWriteTransaction';
import { MUTATION_REQUESTS, TripEntryError } from './tripEntry';
import type { PaymentRecord } from '@/types';

interface Parent extends mongo.Document {
  _id: mongo.ObjectId;
  name: string;
  hashCode: string;
  members: { user: mongo.ObjectId; joinedAt?: Date }[];
}
interface RawPayment extends mongo.Document {
  _id: mongo.ObjectId;
  trip: mongo.ObjectId;
  from: mongo.ObjectId;
  to: mongo.ObjectId;
  amount: number;
  note?: string;
  createdAt: Date;
}
interface RawExpense extends mongo.Document {
  _id: mongo.ObjectId;
  payer: mongo.ObjectId;
  amount: number;
  splits: { user: mongo.ObjectId; shareAmount: number }[];
}
interface Person extends mongo.Document {
  _id: mongo.ObjectId;
  displayName: string;
  isVirtual?: boolean;
  email?: string;
  notifyByEmail?: boolean;
  locale?: string;
}
export interface PaymentDelivery {
  recipients: string[];
  byId: Map<string, Person>;
  type: 'payment_recorded';
  tripHashCode: string;
  tripName: string;
  actorName: string;
  meta: { payment_id: string; amount: number };
}
type Terminal = Exclude<MutationRequest, { status: 'not_found' }>;
interface Receipt {
  _id: string;
  fingerprint: string;
  terminal: Terminal;
  payment?: PaymentRecord;
  createdAt: Date;
}
function canonical(value: unknown): unknown {
  if (value === undefined) return { missing: true };
  if (value instanceof mongo.ObjectId) return { id: value.toHexString() };
  if (value instanceof Date) return { date: value.toISOString() };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  return value;
}
function revision(secret: string, domain: string, tripId: string, fields: unknown) {
  return createHmac('sha256', secret)
    .update(JSON.stringify(canonical({ domain, tripId, fields })))
    .digest('hex');
}
export function paymentRevision(secret: string, tripId: string, payment: mongo.Document) {
  return revision(secret, 'payment/v1', tripId, {
    id: payment._id,
    from: payment.from,
    to: payment.to,
    amount: payment.amount,
    note: payment.note,
  });
}
// Any expense business change invalidates old settlement confirmation, even if net totals agree.
const expenseFields = [
  'payer',
  'amount',
  'splits',
  'originalAmount',
  'currency',
  'exchangeRate',
  'description',
  'category',
  'date',
  'attachments',
  'tags',
  'itineraryDays',
] as const;
async function snapshot(
  db: mongo.Db,
  session: mongo.ClientSession,
  tripId: string,
  secret: string
) {
  const trip = await db
    .collection<Parent>('trips')
    .findOne({ _id: new mongo.ObjectId(tripId) }, { session });
  if (!trip) throw new TripEntryError('NOT_FOUND');
  const expenses = await db
    .collection<RawExpense>('expenses')
    .find({ trip: trip._id }, { session })
    .toArray();
  const payments = await db
    .collection<RawPayment>('payments')
    .find({ trip: trip._id }, { session })
    .sort({ createdAt: -1 })
    .toArray();
  const users = await db
    .collection<Person>('users')
    .find(
      {
        _id: {
          $in: [...trip.members.map((m) => m.user), ...payments.flatMap((p) => [p.from, p.to])],
        },
      },
      {
        session,
        projection: { displayName: 1, isVirtual: 1, email: 1, notifyByEmail: 1, locale: 1 },
      }
    )
    .toArray();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const members = trip.members
    .filter((m) => byId.has(m.user.toString()))
    .sort((a, b) =>
      (a.joinedAt?.toISOString() ?? '').localeCompare(b.joinedAt?.toISOString() ?? '')
    )
    .map((m) => ({ id: m.user.toString(), displayName: byId.get(m.user.toString())!.displayName }));
  const populated = payments.map((p) => ({
    ...p,
    from: byId.has(p.from.toString()) ? { ...byId.get(p.from.toString())!, username: '' } : null,
    to: byId.has(p.to.toString()) ? { ...byId.get(p.to.toString())!, username: '' } : null,
  }));
  const settlement = calculateSettlementDetail(
    trip.members
      .filter((m) => byId.has(m.user.toString()))
      .map((m) => ({
        user: {
          _id: m.user,
          username: '',
          displayName: byId.get(m.user.toString())!.displayName,
        },
      })),
    expenses,
    populated
  );
  const context = paymentContextSchema.parse({
    members,
    settlement: toMobileSettlement(settlement),
    settlementRevision: revision(secret, 'settlement/v1', tripId, {
      members: [trip.members.map((m) => m.user), members.map((m) => m.id)],
      expenses: [...expenses]
        .sort((a, b) => a._id.toString().localeCompare(b._id.toString()))
        .map((e) => ({ id: e._id, ...Object.fromEntries(expenseFields.map((k) => [k, e[k]])) })),
      payments: [...payments]
        .sort((a, b) => a._id.toString().localeCompare(b._id.toString()))
        .map((p) => ({ id: p._id, from: p.from, to: p.to, amount: p.amount, note: p.note })),
    }),
  });
  return { context, trip, payments, settlement, byId };
}
export function readPaymentContext(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  secret: string
): Promise<PaymentContext> {
  return withTripWriteInDatabase(
    db,
    tripId,
    actorId,
    async (session) => (await snapshot(db, session, tripId, secret)).context
  );
}
export function readPaymentRevokeContext(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  paymentId: string,
  secret: string
): Promise<PaymentRevokeContext> {
  return withTripWriteInDatabase(db, tripId, actorId, async (session) => {
    const state = await snapshot(db, session, tripId, secret);
    const raw = state.payments.find((p) => p._id.toString() === paymentId);
    if (!raw) throw new TripEntryError('RESOURCE_GONE');
    return paymentRevokeContextSchema.parse({
      payment: state.context.settlement.payments.find((p) => p.id === paymentId),
      revision: paymentRevision(secret, tripId, raw),
    });
  });
}
/** Receipt, payment and in-app fan-out commit together. External delivery is never replayed. */
export async function writePayment(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  operation: 'payment.create' | 'payment.delete',
  body: PaymentCreateInput | PaymentDeleteInput,
  secret: string,
  paymentId?: string,
  deliver: (event: PaymentDelivery) => Promise<unknown> = async () => undefined
): Promise<{ result: PaymentMutationResult; payment?: PaymentRecord }> {
  const input =
    operation === 'payment.create'
      ? paymentCreateInput.parse(body)
      : paymentDeleteInput.parse(body);
  const key = `${actorId.toLowerCase()}:${input.client_request_id}`;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(canonical({ operation, tripId, paymentId, input })))
    .digest('hex');
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const accepted = await withTripWriteInDatabase(db, tripId, actorId, async (session) => {
        const receipts = db.collection<Receipt>(MUTATION_REQUESTS);
        const existing = await receipts.findOne({ _id: key }, { session });
        if (existing) {
          if (existing.fingerprint !== fingerprint)
            throw new TripEntryError('IDEMPOTENCY_CONFLICT');
          return { terminal: existing.terminal, payment: existing.payment, delivery: undefined };
        }
        const state = await snapshot(db, session, tripId, secret);
        let terminal: Terminal;
        let payment: PaymentRecord | undefined;
        let delivery: PaymentDelivery | undefined;
        const reject = (
          code: 'SETTLEMENT_CHANGED' | 'RESOURCE_CHANGED' | 'RESOURCE_GONE' | 'VALIDATION_ERROR'
        ): Terminal => ({ status: 'rejected', operation, tripId, code });
        if (operation === 'payment.create') {
          const fields = input as PaymentCreateInput;
          if (state.context.settlementRevision !== fields.expected_revision)
            terminal = reject('SETTLEMENT_CHANGED');
          else if (
            ![fields.from_id, fields.to_id].every((id) =>
              state.context.members.some((m) => m.id === id)
            )
          )
            terminal = reject('VALIDATION_ERROR');
          else {
            const raw: RawPayment = {
              _id: new mongo.ObjectId(),
              trip: state.trip._id,
              from: new mongo.ObjectId(fields.from_id),
              to: new mongo.ObjectId(fields.to_id),
              amount: fields.amount,
              note: fields.note,
              createdBy: new mongo.ObjectId(actorId),
              createdAt: new Date(),
            };
            await db.collection<RawPayment>('payments').insertOne(raw, { session });
            const from = state.context.members.find((m) => m.id === fields.from_id)!;
            const to = state.context.members.find((m) => m.id === fields.to_id)!;
            payment = {
              id: raw._id.toString(),
              fromId: from.id,
              fromName: from.displayName,
              toId: to.id,
              toName: to.displayName,
              amount: fields.amount,
              note: fields.note,
              createdAt: raw.createdAt.toISOString(),
            };
            const actorName = state.byId.get(actorId)?.displayName ?? '';
            const meta = { payment_id: payment.id, amount: payment.amount };
            const common = {
              trip: state.trip._id,
              actor: new mongo.ObjectId(actorId),
              actorName,
              type: 'payment_recorded' as const,
              meta,
              createdAt: raw.createdAt,
            };
            // The driver adds _id to its input; keep the notification template untouched.
            await db.collection('activitylogs').insertOne({ ...common }, { session });
            const recipients = [...new Set([fields.from_id, fields.to_id])].filter(
              (id) => id !== actorId && !state.byId.get(id)?.isVirtual
            );
            if (recipients.length)
              await db.collection('notifications').insertMany(
                recipients.map((id) => ({
                  ...common,
                  user: new mongo.ObjectId(id),
                  tripName: state.trip.name,
                  read: false,
                })),
                { session }
              );
            delivery = {
              recipients,
              byId: state.byId,
              type: 'payment_recorded',
              tripHashCode: state.trip.hashCode,
              tripName: state.trip.name,
              actorName,
              meta,
            };
            terminal = {
              status: 'committed',
              operation,
              resourceId: payment.id,
              result: {
                tripId,
                paymentId: payment.id,
                revision: paymentRevision(secret, tripId, raw),
              },
            };
          }
        } else {
          const raw = state.payments.find((p) => p._id.toString() === paymentId);
          if (!raw) terminal = reject('RESOURCE_GONE');
          else if (paymentRevision(secret, tripId, raw) !== input.expected_revision)
            terminal = reject('RESOURCE_CHANGED');
          else {
            await db
              .collection('payments')
              .deleteOne({ _id: raw._id, trip: state.trip._id }, { session });
            // Preserve the Web behavior: revoking does not create new notifications or activities.
            terminal = {
              status: 'committed',
              operation,
              resourceId: raw._id.toString(),
              result: { tripId, paymentId: raw._id.toString(), deleted: true },
            };
          }
        }
        await receipts.insertOne(
          {
            _id: key,
            fingerprint,
            terminal,
            ...(payment ? { payment } : {}),
            createdAt: new Date(),
          },
          { session }
        );
        return { terminal, payment, delivery };
      });
      if (accepted.terminal.status === 'rejected') throw new TripEntryError(accepted.terminal.code);
      if (accepted.delivery)
        await Promise.resolve()
          .then(() => deliver(accepted.delivery!))
          .catch(() => undefined);
      return {
        result: accepted.terminal.result as PaymentMutationResult,
        payment: accepted.payment,
      };
    } catch (error) {
      if ((error as { code?: number })?.code === 11000 && attempt < 9) continue;
      throw error;
    }
  }
  throw new TripEntryError('BUSY');
}
// Legacy Web forms get the current state; the same transaction still checks membership, money,
// preconditions and fan-out. The mobile adapter requires a user-confirmed UUID/revision.
export async function recordPaymentForActor(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  fields: { from_id: string; to_id: string; amount: number; note?: string },
  secret: string,
  deliver: (event: PaymentDelivery) => Promise<unknown>
) {
  const context = await readPaymentContext(db, actorId, tripId, secret);
  const { payment } = await writePayment(
    db,
    actorId,
    tripId,
    'payment.create',
    paymentCreateInput.parse({
      ...fields,
      client_request_id: randomUUID(),
      expected_revision: context.settlementRevision,
    }),
    secret,
    undefined,
    deliver
  );
  return payment!;
}
export async function deletePaymentForActor(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  paymentId: string,
  secret: string
) {
  try {
    const context = await readPaymentRevokeContext(db, actorId, tripId, paymentId, secret);
    await writePayment(
      db,
      actorId,
      tripId,
      'payment.delete',
      { client_request_id: randomUUID(), expected_revision: context.revision },
      secret,
      paymentId
    );
  } catch (error) {
    if (!(error instanceof TripEntryError && error.code === 'RESOURCE_GONE')) throw error;
  }
}
