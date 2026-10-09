import { mongo } from 'mongoose';
import {
  receiptWriteInput,
  type ReceiptWriteInput,
  type ReceiptWriteState,
} from '@travel-budget/contracts';
import { currentLedger } from './ledger';
import { withTripWriteInDatabase, withTripReadInDatabase } from './tripWriteTransaction';
import { buildObjectKey, validateUpload } from './uploads';
import { headObject, presignPut } from './storage';
import { receiptAttachmentId } from './receiptRead';
import { assertBlobsAvailable, retireUnreferencedBlobs } from './blobReferences';
export class ReceiptWriteError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export const RECEIPT_WRITES = 'receiptwrites';
interface Job {
  _id: string;
  actor: string;
  trip: string;
  expense: string;
  input: ReceiptWriteInput;
  key?: string;
  expiresAt: Date;
  state: ReceiptWriteState;
}
const keyOf = (actor: string, uuid: string) => `${actor.toLowerCase()}:${uuid.toLowerCase()}`;
const filter = (trip: string, expense: string) => ({
  _id: new mongo.ObjectId(expense),
  trip: new mongo.ObjectId(trip),
});
function checkScope(job: Job, trip: string, expense: string) {
  if (job.trip !== trip || job.expense !== expense)
    throw new ReceiptWriteError('IDEMPOTENCY_CONFLICT');
}
async function load(db: mongo.Db, actor: string, trip: string, expense: string, uuid: string) {
  return withTripReadInDatabase(db, trip, actor, async (session) => {
    const job = await db
      .collection<Job>(RECEIPT_WRITES)
      .findOne({ _id: keyOf(actor, uuid) }, { session });
    if (job) checkScope(job, trip, expense);
    return job;
  });
}
export async function receiptWriteStatus(
  db: mongo.Db,
  actor: string,
  trip: string,
  expense: string,
  uuid: string
) {
  const job = await load(db, actor, trip, expense, uuid);
  return (
    job?.state ?? { ledger: currentLedger(), clientRequestId: uuid, status: 'not_found' as const }
  );
}
export async function beginReceiptWrite(
  db: mongo.Db,
  actor: string,
  trip: string,
  expense: string,
  raw: unknown
) {
  const parsed = receiptWriteInput.parse(raw);
  const input = { ...parsed, client_request_id: parsed.client_request_id.toLowerCase() };
  // Generate once outside retryable transactions. Never accept storage keys from the client.
  const objectKey =
    input.action === 'add' ? buildObjectKey('receipt', trip, input.contentType) : undefined;
  return withTripWriteInDatabase(db, trip, actor, async (session) => {
    const jobs = db.collection<Job>(RECEIPT_WRITES);
    const _id = keyOf(actor, input.client_request_id);
    const prior = await jobs.findOne({ _id }, { session });
    if (prior) {
      checkScope(prior, trip, expense);
      if (JSON.stringify(prior.input) !== JSON.stringify(input))
        throw new ReceiptWriteError('IDEMPOTENCY_CONFLICT');
      return prior.state;
    }
    const row = await db.collection('expenses').findOne(filter(trip, expense), { session });
    const state: ReceiptWriteState = {
      ledger: currentLedger(),
      clientRequestId: input.client_request_id,
      status: 'pending',
    };
    if (!row) Object.assign(state, { status: 'rejected', code: 'RESOURCE_GONE' });
    else if (input.action === 'add') {
      if (!validateUpload('receipt', input.contentType, input.size).ok)
        throw new ReceiptWriteError('VALIDATION_ERROR');
      if ((row.attachments ?? []).length >= 10)
        Object.assign(state, { status: 'rejected', code: 'ATTACHMENT_LIMIT' });
    } else {
      const items: { key: string }[] = row.attachments ?? [];
      const removed = items.filter((a) => receiptAttachmentId(a.key) === input.attachmentId);
      await db.collection('expenses').updateOne(
        filter(trip, expense),
        {
          $set: {
            attachments: items.filter((a) => receiptAttachmentId(a.key) !== input.attachmentId),
          },
        },
        { session }
      );
      await retireUnreferencedBlobs(
        db,
        session,
        trip,
        removed.map((a) => a.key)
      );
      state.status = 'committed';
    }
    await jobs.insertOne(
      {
        _id,
        actor,
        trip,
        expense,
        input,
        key: objectKey,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        state,
      },
      { session }
    );
    return state;
  });
}
export async function commandReceiptWrite(
  db: mongo.Db,
  actor: string,
  trip: string,
  expense: string,
  uuid: string,
  action: 'upload' | 'finish' | 'cancel'
) {
  const before = await load(db, actor, trip, expense, uuid);
  if (!before) throw new ReceiptWriteError('REQUEST_NOT_FOUND');
  if (before.state.status !== 'pending') return before.state;
  if (before.input.action !== 'add' || !before.key) throw new ReceiptWriteError('VALIDATION_ERROR');
  // Leave two minutes for every outstanding PUT before expiry cleanup can retire its key.
  if (action === 'upload' && Date.now() + 120_000 < before.expiresAt.getTime()) {
    const expiresAt = Date.now() + 120_000;
    const url = await presignPut('receipts', before.key, before.input.contentType, {
      immutable: true,
    });
    const after = await load(db, actor, trip, expense, uuid);
    if (!after || after.state.status !== 'pending') return after?.state ?? before.state;
    return { ...after.state, upload: { url, expiresAt, contentType: before.input.contentType } };
  }
  const object =
    action === 'finish' ? await headObject('receipts', before.key, { strict: true }) : null;
  return withTripWriteInDatabase(db, trip, actor, async (session) => {
    const jobs = db.collection<Job>(RECEIPT_WRITES);
    const job = (await jobs.findOne({ _id: before._id }, { session }))!;
    if (job.state.status !== 'pending') return job.state;
    const input = job.input;
    if (input.action !== 'add' || !job.key) throw new ReceiptWriteError('VALIDATION_ERROR');
    const row = await db.collection('expenses').findOne(filter(trip, expense), { session });
    const code =
      action === 'cancel'
        ? 'CANCELLED'
        : Date.now() + (action === 'upload' ? 120_000 : 0) >= job.expiresAt.getTime()
          ? 'UPLOAD_EXPIRED'
          : !row
            ? 'RESOURCE_GONE'
            : (row.attachments ?? []).length >= 10
              ? 'ATTACHMENT_LIMIT'
              : null;
    if (code) {
      job.state = { ...job.state, status: 'rejected', code };
      await retireUnreferencedBlobs(db, session, trip, [job.key]);
    } else {
      if (!object || object.size !== input.size || object.contentType !== input.contentType)
        throw new ReceiptWriteError('UPLOAD_INCOMPLETE');
      await assertBlobsAvailable(db, session, [job.key]);
      await db.collection('expenses').updateOne(
        filter(trip, expense),
        {
          $push: {
            attachments: { key: job.key, contentType: input.contentType, size: input.size },
          },
        } as mongo.Document,
        { session }
      );
      job.state = { ...job.state, status: 'committed' };
    }
    await jobs.updateOne({ _id: job._id }, { $set: { state: job.state } }, { session });
    return job.state;
  });
}
/** Service-owned expiry: membership loss cannot strand uploads. Same parent fence as writers. */
export async function expireReceiptWrites(
  db: mongo.Db,
  options: { now?: Date; deadline?: number } = {}
) {
  const now = options.now ?? new Date();
  const jobs = db.collection<Job>(RECEIPT_WRITES);
  const candidates = await jobs
    .find({ 'state.status': 'pending', expiresAt: { $lte: now } })
    .limit(25)
    .toArray();
  let retired = 0;
  for (const candidate of candidates) {
    if (options.deadline && Date.now() >= options.deadline) break;
    await db.client.withSession((session) =>
      session.withTransaction(
        async () => {
          await db
            .collection('trips')
            .updateOne(
              { _id: new mongo.ObjectId(candidate.trip) },
              { $inc: { expenseDeliveryFence: 1 } },
              { session }
            );
          const job = await jobs.findOne(
            { _id: candidate._id, 'state.status': 'pending' },
            { session }
          );
          if (!job) return;
          if (job.key) await retireUnreferencedBlobs(db, session, job.trip, [job.key]);
          await jobs.updateOne(
            { _id: job._id },
            { $set: { state: { ...job.state, status: 'rejected', code: 'UPLOAD_EXPIRED' } } },
            { session }
          );
        },
        { writeConcern: { w: 'majority' }, readConcern: { level: 'snapshot' }, timeoutMS: 20_000 }
      )
    );
    retired++;
  }
  return retired;
}
