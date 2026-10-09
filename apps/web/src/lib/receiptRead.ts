import { createHash } from 'node:crypto';
import { mongo } from 'mongoose';
import {
  receiptAttachmentSchema,
  receiptAttachmentsV2Schema,
  receiptViewV2Schema,
  receiptAttachmentIdSchema,
  idSchema,
} from '@travel-budget/contracts';
import { isReceiptKeyForTrip } from './uploads';
import { currentLedger } from './ledger';
import { withTripReadInDatabase, TripWriteError } from './tripWriteTransaction';
import { headObject, presignGet, GET_TTL_SECONDS } from './storage';

export class ReceiptReadError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'EXPENSE_NOT_FOUND'
      | 'ATTACHMENT_UNAVAILABLE'
      | 'ATTACHMENT_DATA_INVALID'
  ) {
    super(code);
  }
}
export function receiptAttachmentId(key: string) {
  return createHash('sha256').update(key).digest('hex');
}
/** Reuses Web receipt key rules/private bucket; the native reader only exposes attached files. */
export async function readReceiptAttachments(
  db: mongo.Db,
  actor: string,
  trip: string,
  expense: string
) {
  if (![actor, trip, expense].every((id) => idSchema.safeParse(id).success))
    throw new ReceiptReadError('NOT_FOUND');
  try {
    return await withTripReadInDatabase(db, trip, actor, async (session) => {
      const row = await db
        .collection('expenses')
        .findOne(
          { _id: new mongo.ObjectId(expense), trip: new mongo.ObjectId(trip) },
          { session, projection: { attachments: 1 } }
        );
      if (!row) throw new ReceiptReadError('EXPENSE_NOT_FOUND');
      const raw: unknown = row.attachments ?? [];
      if (!Array.isArray(raw) || raw.length > 10)
        throw new ReceiptReadError('ATTACHMENT_DATA_INVALID');
      const items = raw.map((value: unknown) => {
        if (
          !value ||
          typeof value !== 'object' ||
          !('key' in value) ||
          typeof value.key !== 'string' ||
          !isReceiptKeyForTrip(trip.toLowerCase(), value.key)
        )
          throw new ReceiptReadError('ATTACHMENT_DATA_INVALID');
        const candidate = value as { key: string; contentType?: unknown; size?: unknown };
        const parsed = receiptAttachmentSchema.safeParse({
          id: receiptAttachmentId(candidate.key),
          contentType: candidate.contentType,
          size: candidate.size,
        });
        if (!parsed.success) throw new ReceiptReadError('ATTACHMENT_DATA_INVALID');
        return { ...parsed.data, key: candidate.key };
      });
      // Keys remain internal; HTTP adapters always use the whitelisted public shape below.
      return { ledger: currentLedger(), items };
    });
  } catch (error) {
    if (error instanceof TripWriteError) throw new ReceiptReadError('NOT_FOUND');
    throw error;
  }
}
export async function receiptList(db: mongo.Db, actor: string, trip: string, expense: string) {
  return receiptAttachmentsV2Schema.parse(await readReceiptAttachments(db, actor, trip, expense));
}
export async function receiptView(
  db: mongo.Db,
  actor: string,
  trip: string,
  expense: string,
  id: string
) {
  const before = await readReceiptAttachments(db, actor, trip, expense);
  if (!receiptAttachmentIdSchema.safeParse(id).success)
    throw new ReceiptReadError('ATTACHMENT_UNAVAILABLE');
  const attachment = before.items.find((item) => item.id === id);
  if (!attachment) throw new ReceiptReadError('ATTACHMENT_UNAVAILABLE');
  // Distinguish missing object from a storage outage; no failed request leaks a signed URL.
  const object = await headObject('receipts', attachment.key, { strict: true });
  if (!object || object.size !== attachment.size || object.contentType !== attachment.contentType)
    throw new ReceiptReadError('ATTACHMENT_UNAVAILABLE');
  const expiresAt = Date.now() + GET_TTL_SECONDS * 1000;
  const url = await presignGet('receipts', attachment.key, { noStore: true });
  // Storage calls may wait. Reauthorize and recheck the reference after them, before publishing.
  const after = await readReceiptAttachments(db, actor, trip, expense);
  const current = after.items.find((item) => item.id === id);
  if (
    !current ||
    current.size !== attachment.size ||
    current.contentType !== attachment.contentType
  )
    throw new ReceiptReadError('ATTACHMENT_UNAVAILABLE');
  return receiptViewV2Schema.parse({ ...current, ledger: after.ledger, url, expiresAt });
}
