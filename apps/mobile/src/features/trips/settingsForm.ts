import {
  dateSchema,
  tripChangesSchema,
  tripLocationSchema,
  type TripSettings,
  type TripUpdateInput,
} from '@/api/contracts';
import type { EntryRequest } from '@/features/expenses/entry';
import { tripSettingsSchema } from '@/api/contracts';
export interface TripSettingsFields {
  name: string;
  description: string;
  start: string;
  end: string;
  destination: string;
  address: string;
  latitude: string;
  longitude: string;
}
export function settingsFields(context: TripSettings): TripSettingsFields {
  const place = context.destination;
  return {
    name: context.name,
    description: context.description,
    start: context.startDate ?? '',
    end: context.endDate ?? '',
    destination: place?.name ?? '',
    address: place?.display_name ?? '',
    latitude: place ? String(place.lat) : '',
    longitude: place ? String(place.lon) : '',
  };
}
export function settingsChanges(context: TripSettings, fields: TripSettingsFields) {
  const start = dateSchema.nullable().parse(fields.start.trim() || null);
  const end = dateSchema.nullable().parse(fields.end.trim() || null);
  if (start && end && start > end) throw new Error('INVALID_DATE_RANGE');
  const original = settingsFields(context);
  const changes: Record<string, unknown> = {};
  for (const [field, key] of [
    ['name', 'name'],
    ['description', 'description'],
    ['start', 'start_date'],
    ['end', 'end_date'],
  ] as const) {
    const value = fields[field].trim();
    if (value !== original[field])
      changes[key] = field === 'start' || field === 'end' ? value || null : value;
  }
  const locationFields = ['destination', 'address', 'latitude', 'longitude'] as const;
  if (locationFields.some((k) => fields[k].trim() !== original[k])) {
    if (!fields.destination.trim() && locationFields.every((k) => !fields[k].trim()))
      changes.destination_location = null;
    else {
      const latitude = fields.latitude.trim(),
        longitude = fields.longitude.trim();
      // Empty/hex/Infinity values must never be coerced to plausible coordinates.
      if (![latitude, longitude].every((v) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)))
        throw new Error('INVALID_LOCATION');
      const sameCoordinates =
        Number(latitude) === context.destination?.lat &&
        Number(longitude) === context.destination?.lon;
      changes.destination_location = tripLocationSchema.parse({
        ...(sameCoordinates ? context.destination : {}),
        name: fields.destination,
        display_name: fields.address,
        lat: Number(latitude),
        lon: Number(longitude),
        // If the base name changed, do not display the old translated name instead.
        ...(fields.destination.trim() !== context.destination?.name ? { names: undefined } : {}),
      });
    }
  }
  return tripChangesSchema.parse(changes);
}
export async function prepareTripSettings(
  request: EntryRequest,
  account: string,
  tripId: string,
  context: TripSettings,
  fields: TripSettingsFields,
  beforeSend: () => void
): Promise<{
  current: TripSettings;
  body?: Omit<TripUpdateInput, 'client_request_id'>;
}> {
  const changes = settingsChanges(context, fields);
  const current = await request(account, `/trips/${tripId}/settings`, tripSettingsSchema, {
    beforeSend,
  });
  beforeSend();
  if (current.revision !== context.revision || current.role !== 'admin') return { current };
  return { current, body: { expected_revision: current.revision, changes } };
}
export function restoreSettings(context: TripSettings, changes: TripUpdateInput['changes']) {
  return settingsFields({
    ...context,
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.description !== undefined ? { description: changes.description } : {}),
    ...(changes.start_date !== undefined ? { startDate: changes.start_date } : {}),
    ...(changes.end_date !== undefined ? { endDate: changes.end_date } : {}),
    ...(changes.destination_location !== undefined
      ? { destination: changes.destination_location }
      : {}),
  });
}
