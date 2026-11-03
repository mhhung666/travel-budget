import { createHash } from 'node:crypto';
import { mongo } from 'mongoose';
import {
  itineraryWriteInput,
  itineraryWriteStateSchema,
  itineraryWriteRejectionSchema,
  itineraryEditContextSchema,
  type ItineraryWriteInput,
  type ItineraryWriteState,
} from '@travel-budget/contracts';
import {
  withTripWriteInDatabase,
  withTripReadInDatabase,
  TripWriteError,
} from './tripWriteTransaction';
import { ItineraryDayCreationError, resolveDayNumber } from './itineraryDayCreation';
import { ItineraryDayUpdateError, type ItineraryWriteContext } from './itineraryDayUpdate';
import { ItineraryDayDeletionError } from './itineraryDayDeletion';
import {
  createItineraryDayForActor,
  updateItineraryDayForActor,
  mutateItineraryActivityForActor,
  deleteItineraryDayForActor,
} from './itineraryMaintenance';
import { cleanupRetiredBlobs } from './blobCleanup';
import { toDayDto, type LeanDay } from './itineraryRead';
import { projectMobileItinerary } from './itineraryProjection';
import type { ActionResult } from '@/actions/types';
import type { ItineraryDay } from '@/types';

export const ITINERARY_RECEIPTS = 'itinerarymutationrequests';
export class ItineraryWriteError extends Error {
  constructor(public readonly code: 'IDEMPOTENCY_CONFLICT' | 'NOT_FOUND') {
    super(code);
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, canonical(v)])
  );
}
const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const key = (actor: string, uuid: string) => `${actor.toLowerCase()}:${uuid.toLowerCase()}`;
type Receipt = {
  _id: string;
  trip: mongo.ObjectId;
  fingerprint: string;
  terminal: ItineraryWriteState;
  createdAt: Date;
};

/** One snapshot, three collection reads under one deadline for all days' deletion impact; never N+1. */
async function readDaysAndImpact(
  db: mongo.Db,
  trip: mongo.ObjectId,
  options: () => mongo.FindOptions
) {
  const days = await db
    .collection('itinerarydays')
    .find({ trip }, options())
    .sort({ dayNumber: 1 })
    .toArray();
  const expenses = await db
    .collection('expenses')
    .find(
      { trip, 'itineraryDays.0': { $exists: true } },
      { ...options(), projection: { _id: 1, itineraryDays: 1 } }
    )
    .toArray();
  const photos = await db
    .collection('photos')
    .find(
      { trip, itineraryDay: { $ne: null } },
      { ...options(), projection: { _id: 1, itineraryDay: 1 } }
    )
    .toArray();
  const expenseIds = new Map<string, string[]>(),
    photoIds = new Map<string, string[]>();
  for (const expense of expenses)
    for (const day of expense.itineraryDays ?? []) {
      const id = day.toString();
      const ids = expenseIds.get(id) ?? [];
      ids.push(expense._id.toString());
      expenseIds.set(id, ids);
    }
  for (const photo of photos)
    if (photo.itineraryDay) {
      const id = photo.itineraryDay.toString();
      const ids = photoIds.get(id) ?? [];
      ids.push(photo._id.toString());
      photoIds.set(id, ids);
    }
  const impacts = new Map(
    days.map((day) => {
      const id = day._id.toString();
      const linkedExpenses = (expenseIds.get(id) ?? []).sort(),
        linkedPhotos = (photoIds.get(id) ?? []).sort();
      const attachments = (day.activities ?? []).flatMap(
        (a: { attachments?: unknown[] }) => a.attachments ?? []
      );
      return [
        id,
        {
          activityCount: (day.activities ?? []).length,
          attachmentCount: attachments.length,
          expenseCount: linkedExpenses.length,
          photoCount: linkedPhotos.length,
          revision: digest({
            id,
            revision: day.revision,
            expenses: linkedExpenses,
            photos: linkedPhotos,
          }),
        },
      ];
    })
  );
  return { days, impacts };
}
async function readAdmin<T>(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  read: (
    session: mongo.ClientSession,
    trip: mongo.WithId<mongo.Document>,
    options: () => mongo.FindOptions
  ) => Promise<T>
) {
  return withTripReadInDatabase(
    db,
    tripId,
    actorId,
    async (session, options) => {
      const trip = await db
        .collection('trips')
        .findOne({ _id: new mongo.ObjectId(tripId) }, options());
      if (
        !trip?.members.some(
          (m: { user: mongo.ObjectId; role: string }) =>
            m.user.toString() === actorId && m.role === 'admin'
        )
      )
        throw new TripWriteError('FORBIDDEN');
      return read(session, trip, options);
    },
    true
  );
}
export async function readItineraryEditContext(db: mongo.Db, actorId: string, tripId: string) {
  return readAdmin(db, actorId, tripId, async (_session, trip, options) => {
    const { days, impacts } = await readDaysAndImpact(db, trip._id, options);
    const dto = days.map((d) => toDayDto(d as unknown as LeanDay));
    const itinerary = projectMobileItinerary(
      tripId,
      { startDate: trip.startDate, endDate: trip.endDate },
      dto
    );
    const byId = new Map(dto.map((d) => [d.id, d]));
    return itineraryEditContextSchema.parse({
      ...itinerary,
      days: itinerary.days.map((day) => ({
        ...day,
        revision: byId.get(day.id)!.revision,
        deleteImpact: impacts.get(day.id),
        activities: day.activities.map((a) => ({
          ...a,
          revision: byId.get(day.id)!.activities.find((x) => x.id === a.id)!.revision,
        })),
      })),
    });
  });
}
/** Read-only authorization snapshot: no delivery fence increment, TTL or inferred success. */
export async function readItineraryWrite(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  uuid: string
) {
  return readAdmin(db, actorId, tripId, async (_session, _trip, options) => {
    const receipt = await db
      .collection<Receipt>(ITINERARY_RECEIPTS)
      .findOne({ _id: key(actorId, uuid), trip: new mongo.ObjectId(tripId) }, options());
    return itineraryWriteStateSchema.parse(receipt?.terminal ?? { status: 'not_found' });
  });
}
async function applyCommand(
  db: mongo.Db,
  actor: string,
  trip: string,
  input: ItineraryWriteInput,
  context: ItineraryWriteContext
): Promise<ActionResult<ItineraryDay | { message: string }>> {
  if (input.operation === 'day.create')
    return createItineraryDayForActor(actor, trip, input, context);
  if (input.operation === 'day.update') {
    const day_number = input.target ? resolveDayNumber(input.target, context.parent) : undefined;
    return updateItineraryDayForActor(actor, trip, input.dayId, { ...input, day_number }, context);
  }
  if (input.operation === 'day.delete') {
    const { days, impacts } = await readDaysAndImpact(
      db,
      new mongo.ObjectId(trip),
      context.options
    );
    const day = days.find((d) => d._id.toString() === input.dayId);
    if (!day) return { success: false, code: 'NOT_FOUND', error: 'NOT_FOUND' };
    if (day.revision !== input.expected_revision)
      return { success: false, code: 'CONFLICT', error: 'CONFLICT' };
    if (impacts.get(input.dayId)!.revision !== input.expected_impact_revision)
      return { success: false, error: 'DELETE_IMPACT_CHANGED' };
    return deleteItineraryDayForActor(actor, trip, input.dayId, context);
  }
  if (input.operation === 'activity.delete')
    return mutateItineraryActivityForActor(
      actor,
      trip,
      input.dayId,
      {
        operation: 'delete',
        activity_id: input.activityId,
        expected_activity_revision: input.expected_activity_revision,
      },
      context
    );
  // Native does not own ticket fields. Preserve the target's attachment references verbatim.
  const current =
    input.operation === 'activity.update'
      ? await db.collection('itinerarydays').findOne(
          {
            _id: new mongo.ObjectId(input.dayId),
            trip: new mongo.ObjectId(trip),
          },
          context.options()
        )
      : null;
  const target = current?.activities?.find(
    (a: { _id: mongo.ObjectId }) =>
      a._id.toString() === (input as { activityId: string }).activityId
  );
  const activity = {
    ...input.activity,
    end_time: input.activity.endTime,
    location_name: input.activity.locationName,
    confirmation_code: input.activity.confirmationCode,
    attachments: (target?.attachments ?? []).map(
      (a: { key: string; contentType: string; size: number }) => ({
        key: a.key,
        content_type: a.contentType,
        size: a.size,
      })
    ),
  };
  return mutateItineraryActivityForActor(
    actor,
    trip,
    input.dayId,
    input.operation === 'activity.create'
      ? { operation: 'add', activity }
      : {
          operation: 'update',
          activity_id: input.activityId,
          expected_activity_revision: input.expected_activity_revision,
          activity,
        },
    context
  );
}

/** Receipt and every database effect commit together. Retry callbacks contain no external delivery. */
export async function writeItinerary(db: mongo.Db, actorId: string, tripId: string, body: unknown) {
  actorId = actorId.toLowerCase();
  tripId = tripId.toLowerCase();
  const input = itineraryWriteInput.parse(body);
  if ('dayId' in input) input.dayId = input.dayId.toLowerCase();
  if ('activityId' in input) input.activityId = input.activityId.toLowerCase();
  // UUID case is not another operation; canonical JSON also ignores property ordering.
  input.client_request_id = input.client_request_id.toLowerCase();
  const fingerprint = digest({ version: 2, tripId, input });
  const delivery = await withTripWriteInDatabase(
    db,
    tripId,
    actorId,
    async (session, options) => {
      const receipts = db.collection<Receipt>(ITINERARY_RECEIPTS);
      const receiptId = key(actorId, input.client_request_id);
      const existing = await receipts.findOne({ _id: receiptId }, options());
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ItineraryWriteError('IDEMPOTENCY_CONFLICT');
        return {
          terminal: itineraryWriteStateSchema.parse(existing.terminal),
          cleanupKeys: [] as string[],
        };
      }
      const trip = await db
        .collection('trips')
        .findOne({ _id: new mongo.ObjectId(tripId) }, options());
      const context: ItineraryWriteContext = {
        session,
        parent: { startDate: trip!.startDate, endDate: trip!.endDate },
        cleanupKeys: [],
        options,
      };
      let result: Awaited<ReturnType<typeof applyCommand>>;
      try {
        result = await applyCommand(db, actorId, tripId, input, context);
      } catch (error) {
        if (
          !(
            error instanceof ItineraryDayCreationError ||
            error instanceof ItineraryDayUpdateError ||
            error instanceof ItineraryDayDeletionError
          )
        )
          throw error;
        result = { success: false, error: error.code, code: error.code };
      }
      const base = {
        client_request_id: input.client_request_id,
        tripId,
        operation: input.operation,
      };
      let state: ItineraryWriteState;
      if (!result.success) {
        // Unknown failures abort the transaction and remain unknown to the client.
        const code = itineraryWriteRejectionSchema.parse(result.error);
        state = itineraryWriteStateSchema.parse({ ...base, status: 'rejected', code });
      } else {
        const day = 'id' in result.data ? result.data : null;
        const activity =
          input.operation === 'activity.create'
            ? day!.activities.at(-1)
            : input.operation === 'activity.update'
              ? day!.activities.find((a) => a.id === input.activityId)
              : null;
        state = itineraryWriteStateSchema.parse({
          ...base,
          status: 'committed',
          result: {
            dayId: day?.id ?? (input as { dayId: string }).dayId,
            dayRevision: day?.revision ?? null,
            activityId:
              activity?.id ?? (input.operation === 'activity.delete' ? input.activityId : null),
            activityRevision: activity?.revision ?? null,
            deleted: input.operation === 'day.delete' || input.operation === 'activity.delete',
          },
        });
      }
      await receipts.insertOne(
        {
          _id: receiptId,
          trip: new mongo.ObjectId(tripId),
          fingerprint,
          terminal: state,
          createdAt: new Date(),
        },
        options()
      );
      // Retired blob jobs were already persisted inside the transaction. Cron owns retries;
      // no storage request may run before the terminal receipt commits.
      return { terminal: state, cleanupKeys: context.cleanupKeys };
    },
    'admin',
    true
  ).catch(async (error: unknown) => {
    // Different trips have different fences; their simultaneous actor/UUID collision
    // is resolved by the receipt primary key. The losing transaction was rolled back.
    if ((error as { code?: number })?.code !== 11000) throw error;
    return readAdmin(db, actorId, tripId, async (_session, _trip, options) => {
      const existing = await db
        .collection<Receipt>(ITINERARY_RECEIPTS)
        .findOne({ _id: key(actorId, input.client_request_id) }, options());
      if (!existing) throw error;
      if (existing.fingerprint !== fingerprint)
        throw new ItineraryWriteError('IDEMPOTENCY_CONFLICT');
      return {
        terminal: itineraryWriteStateSchema.parse(existing.terminal),
        cleanupKeys: [] as string[],
      };
    });
  });
  // Durable cleanup jobs cover process death here; no sensitive storage keys in receipts.
  await cleanupRetiredBlobs(db, delivery.cleanupKeys);
  return delivery.terminal;
}
