import { createHash, createHmac } from 'node:crypto';
import { mongo } from 'mongoose';
import {
  tripSettingsSchema,
  tripCurrencyContextSchema,
  tripCurrencyInput,
  type TripCurrencyInput,
  tripUpdateInput,
  tripArchiveInput,
  type TripSettings,
  type TripUpdateInput,
  type TripArchiveInput,
  type TripManagementResult,
  type MutationRequest,
} from '@travel-budget/contracts';
import { withTripWriteInDatabase } from './tripWriteTransaction';
import { MUTATION_REQUESTS, TripEntryError } from './tripEntry';
import { normalizeCurrencySettings, applyCurrencySettings } from './currencySettings';
import { getAllCurrencyCodes } from '@/constants/currencies';
import { isEffectiveTripDateRangeValid } from './dateRange';
import { TripManagementError } from './tripManagementError';
import { rebindAutoPhotosInTransaction } from './photoItineraryTransaction';

interface Parent extends mongo.Document {
  _id: mongo.ObjectId;
  name: string;
  description?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  members: { user: mongo.ObjectId; role: 'admin' | 'member'; archivedAt?: Date | null }[];
}
export { TripManagementError } from './tripManagementError';
function canonical(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  return value;
}
function token(secret: string, domain: string, tripId: string, data: unknown) {
  return createHmac('sha256', secret)
    .update(JSON.stringify(canonical({ domain, tripId, data })))
    .digest('hex');
}
function editable(trip: Parent) {
  return {
    name: trip.name,
    description: trip.description ?? '',
    startDate: trip.startDate,
    endDate: trip.endDate,
    destination: trip.destinationLocation,
  };
}
const day = (value?: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
function context(trip: Parent, actorId: string, secret: string): TripSettings {
  const me = trip.members.find((m) => m.user.toString() === actorId)!;
  return tripSettingsSchema.parse({
    tripId: trip._id.toString(),
    name: trip.name,
    description: trip.description ?? '',
    startDate: day(trip.startDate),
    endDate: day(trip.endDate),
    destination: trip.destinationLocation
      ? Object.fromEntries(
          ['name', 'display_name', 'lat', 'lon', 'names', 'country', 'country_code']
            .filter((key) => trip.destinationLocation[key] !== undefined)
            .map((key) => [key, trip.destinationLocation[key]])
        )
      : null,
    role: me.role,
    archived: !!me.archivedAt,
    revision: token(secret, 'trip-settings/v1', trip._id.toString(), editable(trip)),
    archiveRevision: token(secret, 'trip-archive/v1', trip._id.toString(), {
      actorId,
      archived: !!me.archivedAt,
    }),
  });
}
function currencyContext(trip: Parent, actorId: string, secret: string) {
  const settings = trip.currencySettings
    ? {
        default_currency: trip.currencySettings.defaultCurrency ?? null,
        currencies: trip.currencySettings.currencies.map(
          (c: { code: string; rate?: number | null }) => ({ code: c.code, rate: c.rate ?? null })
        ),
      }
    : null;
  return tripCurrencyContextSchema.parse({
    tripId: trip._id.toString(),
    role: trip.members.find((m) => m.user.toString() === actorId)!.role,
    revision: token(secret, 'trip-currency/v1', trip._id.toString(), settings),
    settings,
    supportedCurrencies: getAllCurrencyCodes(),
  });
}
export function readTripCurrency(db: mongo.Db, actorId: string, tripId: string, secret: string) {
  actorId = actorId.toLowerCase();
  return withTripWriteInDatabase(db, tripId, actorId, async (session) =>
    currencyContext(await parent(db, session, tripId), actorId, secret)
  );
}
async function parent(db: mongo.Db, session: mongo.ClientSession, tripId: string) {
  const trip = await db
    .collection<Parent>('trips')
    .findOne({ _id: new mongo.ObjectId(tripId) }, { session });
  if (!trip) throw new TripEntryError('NOT_FOUND');
  return trip;
}
/** Also used by the Web adapter; merge partial dates under the same parent fence. */
async function applyChanges(
  db: mongo.Db,
  session: mongo.ClientSession,
  trip: Parent,
  changes: {
    name?: string;
    description?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    destination_location?: unknown;
  }
) {
  if (
    (changes.start_date !== undefined || changes.end_date !== undefined) &&
    !isEffectiveTripDateRangeValid(
      trip.startDate,
      trip.endDate,
      changes.start_date,
      changes.end_date
    )
  )
    throw new TripManagementError('VALIDATION_ERROR');
  const set: mongo.Document = {};
  if (changes.name !== undefined) set.name = changes.name.trim();
  if (changes.description !== undefined) set.description = changes.description?.trim() || '';
  if (changes.start_date !== undefined)
    set.startDate = changes.start_date ? new Date(changes.start_date) : null;
  if (changes.end_date !== undefined)
    set.endDate = changes.end_date ? new Date(changes.end_date) : null;
  if (changes.destination_location !== undefined)
    set.destinationLocation = changes.destination_location ?? null;
  if (Object.keys(set).length)
    await db.collection<Parent>('trips').updateOne({ _id: trip._id }, { $set: set }, { session });
  Object.assign(trip, set);
  if (changes.start_date !== undefined || changes.end_date !== undefined)
    await rebindAutoPhotosInTransaction(db, session, trip._id, trip, new Date());
  return trip;
}
async function applyArchive(
  db: mongo.Db,
  session: mongo.ClientSession,
  trip: Parent,
  actorId: string,
  archived: boolean
) {
  const archivedAt = archived ? new Date() : null;
  await db
    .collection<Parent>('trips')
    .updateOne(
      { _id: trip._id, 'members.user': new mongo.ObjectId(actorId) },
      { $set: { 'members.$.archivedAt': archivedAt } },
      { session }
    );
  trip.members.find((m) => m.user.toString() === actorId)!.archivedAt = archivedAt;
  return trip;
}
export function readTripSettings(db: mongo.Db, actorId: string, tripId: string, secret: string) {
  return withTripWriteInDatabase(db, tripId, actorId, async (session) =>
    context(await parent(db, session, tripId), actorId, secret)
  );
}
type Terminal = Exclude<MutationRequest, { status: 'not_found' }>;
interface Receipt {
  _id: string;
  fingerprint: string;
  terminal: Terminal;
  createdAt: Date;
}
export async function manageTrip(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  operation: 'trip.update' | 'trip.archive' | 'trip.currency',
  body: TripUpdateInput | TripArchiveInput | TripCurrencyInput,
  secret: string
): Promise<TripManagementResult> {
  actorId = actorId.toLowerCase();
  tripId = tripId.toLowerCase();
  const input =
    operation === 'trip.currency'
      ? tripCurrencyInput.parse(body)
      : operation === 'trip.update'
        ? tripUpdateInput.parse(body)
        : tripArchiveInput.parse(body);
  const key = `${actorId.toLowerCase()}:${input.client_request_id}`;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(canonical({ operation, tripId, input })))
    .digest('hex');
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const terminal = await withTripWriteInDatabase(db, tripId, actorId, async (session) => {
        const receipts = db.collection<Receipt>(MUTATION_REQUESTS);
        const previous = await receipts.findOne({ _id: key }, { session });
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new TripEntryError('IDEMPOTENCY_CONFLICT');
          return previous.terminal;
        }
        const trip = await parent(db, session, tripId);
        const current = context(trip, actorId, secret);
        const currency =
          operation === 'trip.currency' ? currencyContext(trip, actorId, secret) : null;
        let outcome: Terminal;
        const reject = (code: 'RESOURCE_CHANGED' | 'VALIDATION_ERROR' | 'FORBIDDEN'): Terminal => ({
          status: 'rejected',
          operation,
          tripId,
          code,
        });
        if (operation !== 'trip.archive' && current.role !== 'admin') outcome = reject('FORBIDDEN');
        else if (
          (operation === 'trip.currency'
            ? currency!.revision
            : operation === 'trip.update'
              ? current.revision
              : current.archiveRevision) !== input.expected_revision
        )
          outcome = reject('RESOURCE_CHANGED');
        else {
          try {
            if (operation === 'trip.currency') {
              const normalized = normalizeCurrencySettings((input as TripCurrencyInput).settings);
              await applyCurrencySettings(db, session, trip._id, normalized);
              trip.currencySettings = normalized;
            } else if (operation === 'trip.update')
              await applyChanges(db, session, trip, (input as TripUpdateInput).changes);
            else
              await applyArchive(db, session, trip, actorId, (input as TripArchiveInput).archived);
            const next = context(trip, actorId, secret);
            outcome = {
              status: 'committed',
              operation,
              resourceId: tripId,
              result:
                operation === 'trip.currency'
                  ? { tripId, revision: currencyContext(trip, actorId, secret).revision }
                  : operation === 'trip.update'
                    ? { tripId, revision: next.revision }
                    : { tripId, archived: next.archived },
            };
          } catch (error) {
            if (!(error instanceof TripManagementError && error.code === 'VALIDATION_ERROR'))
              throw error;
            outcome = reject('VALIDATION_ERROR');
          }
        }
        await receipts.insertOne(
          { _id: key, fingerprint, terminal: outcome, createdAt: new Date() },
          { session }
        );
        return outcome;
      });
      if (terminal.status === 'rejected') throw new TripEntryError(terminal.code);
      return terminal.result as TripManagementResult;
    } catch (error) {
      if ((error as { code?: number })?.code === 11000 && attempt < 9) continue;
      throw error;
    }
  }
  throw new TripEntryError('BUSY');
}
/** Existing cookie forms keep their partial input and result; both clients share the writer. */
export function updateTripForActor(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  changes: Parameters<typeof applyChanges>[3]
) {
  return withTripWriteInDatabase(
    db,
    tripId,
    actorId,
    async (session) => applyChanges(db, session, await parent(db, session, tripId), changes),
    'admin'
  );
}
export function archiveTripForActor(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  archived: boolean
) {
  return withTripWriteInDatabase(db, tripId, actorId, async (session) =>
    applyArchive(db, session, await parent(db, session, tripId), actorId, archived)
  );
}
