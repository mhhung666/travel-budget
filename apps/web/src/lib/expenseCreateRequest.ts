import { receiptStamp, checkReceiptVersion, ledgerFingerprint, LedgerError } from './ledger';
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
  data?: Expense;
  contractVersion?: number;
  rejected?: 'LEDGER_CURRENCY_MISMATCH';
}
interface Scope {
  tripId: string;
  actorId: string;
}
interface Request extends Scope {
  // Callers must pass schema-parsed input, which gives fields a stable order/defaults.
  input: CreateExpenseInput;
}

/**
 * A receipt keeps the identity every earlier version wrote: `_id` is `trip:actor:key` with the key
 * spelled exactly as the client sent it, and the fingerprint hashes the schema-parsed input as is.
 * Do not normalize either (lowercasing the key, for one, changes both): a retry of a request that
 * was accepted before the change would stop finding its receipt and create the expense again, and
 * an older server could not find what a newer one stored during a rollout or rollback.
 */
const receiptId = (scope: Scope, spelling: string) =>
  `${scope.tripId}:${scope.actorId}:${spelling}`;
const fingerprintOf = (input: CreateExpenseInput, key: string) =>
  createHash('sha256')
    .update(JSON.stringify(ledgerFingerprint({ ...input, client_request_id: key })))
    .digest('hex');

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Filter for a receipt whose key is this one in any letter case. The range is exactly this actor's
 * receipts in this trip (';' is the character after ':'), so the index scan stays that small however
 * large the collection grows; the case-insensitive pattern then picks the key inside it.
 */
export const receiptSearch = (scope: Scope, key: string) => ({
  _id: {
    $gte: receiptId(scope, ''),
    $lt: `${scope.tripId}:${scope.actorId};`,
    $regex: `^${escapePattern(receiptId(scope, key))}$`,
    $options: 'i',
  },
});

/**
 * A UUID is the same key in any letter case, but a receipt keeps the case its client used, so a
 * retry may spell the key differently from the receipt it has to find. A receipt stored under
 * exactly the spelling that was sent always wins; otherwise any other spelling of the key matches
 * (the smallest `_id` if several exist, which only earlier versions could have produced). Reads
 * only: new receipts always use the spelling that was sent.
 */
async function findReceipt(
  db: mongo.Db,
  scope: Scope,
  key: string,
  session?: mongo.ClientSession
): Promise<Receipt | undefined> {
  const receipts = db.collection<Receipt>(EXPENSE_CREATE_REQUESTS);
  const exact = await receipts.findOne({ _id: receiptId(scope, key) }, { session });
  if (exact) return exact;
  return (
    (await receipts.findOne(receiptSearch(scope, key), { session, sort: { _id: 1 } })) ?? undefined
  );
}

/**
 * The accepted result of this actor's earlier request, regardless of what has happened to the
 * expense or the trip membership since. Callers must authorize the actor for the trip first.
 */
export async function readExpenseCreateReceipt(
  db: mongo.Db,
  { tripId, actorId, clientRequestId }: Scope & { clientRequestId: string }
): Promise<Expense | undefined> {
  const receipt = await findReceipt(db, { tripId, actorId }, clientRequestId);
  if (receipt) checkReceiptVersion(receipt);
  return receipt?.data;
}

export async function readExpenseCreateResult(
  db: mongo.Db,
  request: Request,
  session?: mongo.ClientSession
): Promise<Expense | undefined> {
  const key = request.input.client_request_id;
  if (!key) return;
  const receipt = await findReceipt(db, request, key, session);
  if (!receipt) return;
  checkReceiptVersion(receipt);
  // The stored fingerprint covers the spelling of the key the receipt was stored under (the end
  // of its `_id`), which may differ from the spelling of this retry.
  const stored = receipt._id.slice(receiptId(request, '').length);
  if (receipt.fingerprint !== fingerprintOf(request.input, stored)) {
    throw new TripWriteError('CONFLICT');
  }
  if (receipt.rejected) throw new LedgerError(receipt.rejected);
  return receipt.data;
}

/** Must run under withTripWrite's parent fence, in the same transaction as the insert.
 * Keep receipts after expense deletion: a late retry must never recreate a deleted expense.
 * The built-in unique _id index guards equal spellings and the trip fence serializes the rest;
 * no TTL may forget accepted requests.
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
  const key = request.input.client_request_id;
  if (key) {
    await db.collection<Receipt>(EXPENSE_CREATE_REQUESTS).insertOne(
      {
        _id: receiptId(request, key),
        fingerprint: fingerprintOf(request.input, key),
        trip: new mongo.ObjectId(request.tripId),
        ...receiptStamp(),
        data: result.data,
      },
      { session }
    );
  }
  return { ...result, replayed: false };
}

export async function readExpenseCreateRejection(
  db: mongo.Db,
  scope: Scope & { clientRequestId: string }
) {
  const receipt = await findReceipt(db, scope, scope.clientRequestId);
  if (receipt) checkReceiptVersion(receipt);
  return receipt?.rejected;
}

export async function rejectExpenseCreateRequest(
  db: mongo.Db,
  session: mongo.ClientSession,
  request: Request
) {
  const key = request.input.client_request_id!;
  await db.collection<Receipt>(EXPENSE_CREATE_REQUESTS).insertOne(
    {
      _id: receiptId(request, key),
      fingerprint: fingerprintOf(request.input, key),
      trip: new mongo.ObjectId(request.tripId),
      ...receiptStamp(),
      rejected: 'LEDGER_CURRENCY_MISMATCH',
    },
    { session }
  );
}
