import { createHash } from 'node:crypto';
import { mongo } from 'mongoose';
import type { CreateExpenseInput } from './validation';
import type { Expense } from '@/types';
import { TripWriteError } from './tripWriteTransaction';

export const EXPENSE_CREATE_REQUESTS = 'expensecreaterequests';
interface Receipt {
  _id: string;
  trip: mongo.ObjectId;
  fingerprint: string;
  data: Expense;
}
interface Request {
  tripId: string;
  actorId: string;
  // Callers must pass schema-parsed input, which gives fields a stable order/defaults.
  input: CreateExpenseInput;
}
function identity({ tripId, actorId, input }: Request) {
  return {
    _id: `${tripId}:${actorId}:${input.client_request_id}`,
    fingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
  };
}

export async function readExpenseCreateResult(
  db: mongo.Db,
  request: Request,
  session?: mongo.ClientSession
): Promise<Expense | undefined> {
  if (!request.input.client_request_id) return;
  const { _id, fingerprint } = identity(request);
  const receipt = await db
    .collection<Receipt>(EXPENSE_CREATE_REQUESTS)
    .findOne({ _id }, { session });
  if (!receipt) return;
  if (receipt.fingerprint !== fingerprint) throw new TripWriteError('CONFLICT');
  return receipt.data;
}

/** Must run under withTripWrite's parent fence, in the same transaction as the insert.
 * Keep receipts after expense deletion: a late retry must never recreate a deleted expense.
 * The built-in unique _id index is the final guard; no TTL may forget accepted requests.
 */
export async function withExpenseCreateRequest<T extends { data: Expense }>(
  db: mongo.Db,
  session: mongo.ClientSession,
  request: Request,
  create: () => Promise<T>
): Promise<({ replayed: false } & T) | { replayed: true; data: Expense }> {
  const existing = await readExpenseCreateResult(db, request, session);
  if (existing) return { replayed: true, data: existing };
  const result = await create();
  if (request.input.client_request_id) {
    await db
      .collection<Receipt>(EXPENSE_CREATE_REQUESTS)
      .insertOne(
        { ...identity(request), trip: new mongo.ObjectId(request.tripId), data: result.data },
        { session }
      );
  }
  return { ...result, replayed: false };
}
