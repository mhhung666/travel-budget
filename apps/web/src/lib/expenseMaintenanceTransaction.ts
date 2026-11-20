import { mongo } from 'mongoose';
import type { LedgerMutationRequest, MutationRequest } from '@travel-budget/contracts';
import { checkReceiptVersion, receiptStamp, terminalWithLedger } from './ledger';
import { retireUnreferencedBlobs } from './blobReferences';
import { MUTATION_REQUESTS } from './tripEntry';
import { TripWriteError } from './tripWriteTransaction';

export type ExpenseTerminal = Exclude<
  MutationRequest | LedgerMutationRequest,
  { status: 'not_found' }
>;
type RequestIdentity = { key: string; fingerprint: string };
type Outcome = { terminal: ExpenseTerminal; keys: string[] };
type Receipt = {
  _id: string;
  fingerprint: string;
  contractVersion?: number;
  ledger?: unknown;
  terminal: ExpenseTerminal;
  createdAt: Date;
};

// Call only inside an authorized trip snapshot, including the Web attachment preflight.
export async function readExpenseReceipt(
  db: mongo.Db,
  session: mongo.ClientSession,
  request: RequestIdentity
) {
  const receipt = await db
    .collection<Receipt>(MUTATION_REQUESTS)
    .findOne({ _id: request.key }, { session });
  if (!receipt) return null;
  checkReceiptVersion(receipt);
  if (receipt.fingerprint !== request.fingerprint) throw new TripWriteError('CONFLICT');
  return receipt.terminal;
}

// The caller holds the trip write fence. Save successes and terminal refusals in the
// same session as the mutation. Only a fresh commit returns keys for post-commit cleanup.
export async function withExpenseReceipt(
  db: mongo.Db,
  session: mongo.ClientSession,
  request: RequestIdentity,
  mutate: () => Promise<Outcome>
): Promise<Outcome> {
  const existing = await readExpenseReceipt(db, session, request);
  if (existing) return { terminal: existing, keys: [] };
  const { terminal, keys } = await mutate();
  const stored = terminalWithLedger(terminal);
  await db.collection<Receipt>(MUTATION_REQUESTS).insertOne(
    {
      _id: request.key,
      fingerprint: request.fingerprint,
      ...receiptStamp(),
      terminal: stored,
      createdAt: new Date(),
    },
    { session }
  );
  return { terminal: stored, keys };
}

export async function deleteExpenseRecords(
  db: mongo.Db,
  session: mongo.ClientSession,
  tripId: string,
  expenseId: string
) {
  const trip = new mongo.ObjectId(tripId);
  const expense = new mongo.ObjectId(expenseId);
  const deleted = await db
    .collection<{ attachments?: { key: string }[] }>('expenses')
    .findOneAndDelete({ _id: expense, trip }, { session, projection: { 'attachments.key': 1 } });
  await db.collection('comments').deleteMany({ trip, expense }, { session });
  return retireUnreferencedBlobs(
    db,
    session,
    tripId,
    (deleted?.attachments ?? []).map((a) => a.key)
  );
}

export async function recordExpenseActivity(
  db: mongo.Db,
  session: mongo.ClientSession,
  activity: {
    tripId: string;
    actorId: string;
    actorName?: string;
    type: 'expense_updated' | 'expense_deleted';
    meta: { description: string; expense_id?: string; baseCurrency?: string };
  }
) {
  const actor = new mongo.ObjectId(activity.actorId);
  const actorName =
    activity.actorName ??
    (
      await db
        .collection<{ displayName: string }>('users')
        .findOne({ _id: actor }, { session, projection: { displayName: 1 } })
    )?.displayName ??
    '';
  await db.collection('activitylogs').insertOne(
    {
      trip: new mongo.ObjectId(activity.tripId),
      actor,
      actorName,
      type: activity.type,
      meta: activity.meta,
      createdAt: new Date(),
    },
    { session }
  );
}
