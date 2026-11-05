import { createHash } from 'node:crypto';
import { mongo } from 'mongoose';
import {
  activityDeletionPreviewInput,
  activityDeletionPreviewSchema,
  activityDeletionInput,
  activityDeletionStateSchema,
  type ActivityDeletionPreviewInput,
  type ActivityDeletionState,
} from '@travel-budget/contracts';
import { withTripWriteInDatabase } from './tripWriteTransaction';
import { ITINERARY_RECEIPTS, ItineraryWriteError, readItineraryAdmin } from './itineraryWrite';
import { retireUnreferencedBlobs } from './blobReferences';
import { cleanupRetiredBlobs } from './blobCleanup';
import { dateForDayNumber, toDateOnly } from './itineraryDayTarget';
import type { LeanActivity, LeanDay } from './itineraryRead';

const key = (actor: string, uuid: string) => `${actor.toLowerCase()}:${uuid.toLowerCase()}`;
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongo.ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, canonical(v)])
  );
}
const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
function normalize(input: ActivityDeletionPreviewInput) {
  return {
    ...input,
    dayId: input.dayId.toLowerCase(),
    targets: input.targets
      .map((t) => ({ ...t, activityId: t.activityId.toLowerCase() }))
      .sort((a, b) => a.activityId.localeCompare(b.activityId)),
  };
}
type StoredDay = LeanDay & { _id: mongo.ObjectId };
type Receipt = {
  _id: string;
  trip: mongo.ObjectId;
  fingerprint: string;
  terminal: ActivityDeletionState;
  createdAt: Date;
};
function preview(
  tripId: string,
  parent: mongo.Document,
  day: StoredDay,
  input: ActivityDeletionPreviewInput
) {
  const byId = new Map((day.activities ?? []).map((a) => [a._id.toString(), a]));
  const selected = input.targets.map((t) => byId.get(t.activityId));
  const start = toDateOnly(parent.startDate);
  const date = start ? dateForDayNumber(start, day.dayNumber) : null;
  return activityDeletionPreviewSchema.parse({
    tripId,
    dayId: input.dayId,
    dayNumber: day.dayNumber,
    title: day.title,
    date,
    targets: selected
      .filter((a): a is LeanActivity => !!a)
      .map((a) => ({
        activityId: a._id.toString(),
        revision: a.revision,
        title: a.title,
        time: a.time ?? null,
        endTime: a.endTime ?? null,
        locationName: a.locationName || a.location?.name || '',
      })),
    missingIds: input.targets.filter((t) => !byId.has(t.activityId)).map((t) => t.activityId),
    changedIds: input.targets
      .filter(
        (t) => byId.has(t.activityId) && byId.get(t.activityId)!.revision !== t.expectedRevision
      )
      .map((t) => t.activityId),
    // Whole selected documents cover attachment references and even changes made by legacy writers.
    // Do not include the day's revision, content, or unselected activities.
    contextRevision: digest({
      tripId,
      dayId: input.dayId,
      dayNumber: day.dayNumber,
      title: day.title,
      date,
      selected,
    }),
  });
}
export async function previewActivityDeletion(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  body: unknown
) {
  actorId = actorId.toLowerCase();
  tripId = tripId.toLowerCase();
  const input = normalize(activityDeletionPreviewInput.parse(body));
  return readItineraryAdmin(db, actorId, tripId, async (_session, parent, options) => {
    const day = await db
      .collection<StoredDay>('itinerarydays')
      .findOne(
        { _id: new mongo.ObjectId(input.dayId), trip: new mongo.ObjectId(tripId) },
        options()
      );
    if (!day) throw new ItineraryWriteError('NOT_FOUND');
    return preview(tripId, parent, day, input);
  });
}
export async function readActivityDeletion(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  uuid: string
) {
  actorId = actorId.toLowerCase();
  tripId = tripId.toLowerCase();
  return readItineraryAdmin(db, actorId, tripId, async (_session, _parent, options) => {
    const receipt = await db
      .collection<Receipt>(ITINERARY_RECEIPTS)
      .findOne({ _id: key(actorId, uuid) }, options());
    if (
      receipt &&
      (receipt.trip.toString() !== tripId ||
        (receipt.terminal.status !== 'not_found' &&
          receipt.terminal.operation !== 'activities.delete'))
    )
      throw new ItineraryWriteError('IDEMPOTENCY_CONFLICT');
    return activityDeletionStateSchema.parse(receipt?.terminal ?? { status: 'not_found' });
  });
}
/** All targets, attachment retirement and one terminal receipt commit under the same parent fence. */
export async function deleteActivities(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  body: unknown
) {
  actorId = actorId.toLowerCase();
  tripId = tripId.toLowerCase();
  const raw = activityDeletionInput.parse(body);
  const input = {
    ...raw,
    ...normalize(raw),
    client_request_id: raw.client_request_id.toLowerCase(),
  };
  const fingerprint = digest({ version: 2, operation: 'activities.delete', tripId, input });
  const receiptId = key(actorId, input.client_request_id);
  const delivery = await withTripWriteInDatabase(
    db,
    tripId,
    actorId,
    async (session, options) => {
      const receipts = db.collection<Receipt>(ITINERARY_RECEIPTS);
      const existing = await receipts.findOne({ _id: receiptId }, options());
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ItineraryWriteError('IDEMPOTENCY_CONFLICT');
        return {
          terminal: activityDeletionStateSchema.parse(existing.terminal),
          cleanupKeys: [] as string[],
        };
      }
      const parent = await db
        .collection('trips')
        .findOne({ _id: new mongo.ObjectId(tripId) }, options());
      const day = await db
        .collection<StoredDay>('itinerarydays')
        .findOne(
          { _id: new mongo.ObjectId(input.dayId), trip: new mongo.ObjectId(tripId) },
          options()
        );
      const current = day ? preview(tripId, parent!, day, input) : null;
      const base = {
        client_request_id: input.client_request_id,
        tripId,
        operation: 'activities.delete' as const,
      };
      let terminal: ActivityDeletionState;
      let cleanupKeys: string[] = [];
      if (!current || current.missingIds.length)
        terminal = { ...base, status: 'rejected', code: 'NOT_FOUND' };
      else if (
        current.changedIds.length ||
        current.contextRevision !== input.expectedContextRevision
      )
        terminal = { ...base, status: 'rejected', code: 'CONFLICT' };
      else {
        const ids = input.targets.map((t) => t.activityId);
        const selected = new Set(ids);
        const keys = (day!.activities ?? [])
          .filter((a) => selected.has(a._id.toString()))
          .flatMap((a) => (a.attachments ?? []).map((at) => at.key));
        await db
          .collection<{
            _id: mongo.ObjectId;
            trip: mongo.ObjectId;
            activities: { _id: mongo.ObjectId }[];
            revision: number;
            updatedAt: Date;
          }>('itinerarydays')
          .updateOne(
            { _id: day!._id, trip: new mongo.ObjectId(tripId) },
            {
              $pull: { activities: { _id: { $in: ids.map((id) => new mongo.ObjectId(id)) } } },
              $inc: { revision: 1 },
              $set: { updatedAt: new Date() },
            },
            options()
          );
        cleanupKeys = await retireUnreferencedBlobs(db, session, tripId, keys, options);
        terminal = {
          ...base,
          status: 'committed',
          result: { dayId: input.dayId, activityIds: ids, count: ids.length },
        };
      }
      await receipts.insertOne(
        {
          _id: receiptId,
          trip: new mongo.ObjectId(tripId),
          fingerprint,
          terminal,
          createdAt: new Date(),
        },
        options()
      );
      return { terminal, cleanupKeys };
    },
    'admin',
    true
  ).catch(async (error: unknown) => {
    if ((error as { code?: number })?.code !== 11000) throw error;
    return readItineraryAdmin(db, actorId, tripId, async (_s, _p, options) => {
      const existing = await db
        .collection<Receipt>(ITINERARY_RECEIPTS)
        .findOne({ _id: receiptId }, options());
      if (!existing) throw error;
      if (existing.fingerprint !== fingerprint)
        throw new ItineraryWriteError('IDEMPOTENCY_CONFLICT');
      return {
        terminal: activityDeletionStateSchema.parse(existing.terminal),
        cleanupKeys: [] as string[],
      };
    });
  });
  await cleanupRetiredBlobs(db, delivery.cleanupKeys);
  return delivery.terminal;
}
