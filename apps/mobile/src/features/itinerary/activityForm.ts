import {
  itineraryWriteInput,
  itineraryActivityTiming,
  itineraryEndDayOffsetSchema,
  dateSchema,
  type ItineraryWriteInput,
  type ItineraryEditContext,
} from '@travel-budget/contracts';
import { DayFormError, type DayContext } from './dayForm';
export type ActivityContext = DayContext['activities'][number];
export type ActivityCommand = Extract<ItineraryWriteInput, { operation: `activity.${string}` }>;
export type ActivityFields = {
  title: string;
  type: string;
  time: string;
  endTime: string;
  endDayMode: string;
  endDayValue: string;
  locationName: string;
  place: string;
  address: string;
  latitude: string;
  longitude: string;
  note: string;
  confirmationCode: string;
};
export function activityFields(
  activity?: ActivityContext,
  day?: Pick<DayContext, 'date' | 'dayNumber'>,
  supported = true
): ActivityFields {
  const offset = activity ? (activity.endDayOffset ?? null) : supported ? 0 : null;
  const endDate = itineraryActivityTiming({
    startDate: day?.date ?? null,
    dayNumber: 1,
    time: null,
    endTime: null,
    endDayOffset: offset ?? 0,
  }).endDate;
  return {
    title: activity?.title ?? '',
    type: activity?.type ?? 'activity',
    time: activity?.time ?? '',
    endTime: activity?.endTime ?? '',
    endDayMode:
      offset === null ? 'unknown' : offset === 0 || offset === 1 ? String(offset) : 'other',
    endDayValue: day?.date ? (endDate ?? '') : String((day?.dayNumber ?? 1) + (offset ?? 0)),
    locationName: activity?.locationName ?? '',
    place: activity?.location?.name ?? '',
    address: activity?.location?.display_name ?? '',
    latitude: activity?.location ? String(activity.location.lat) : '',
    longitude: activity?.location ? String(activity.location.lon) : '',
    note: activity?.note ?? '',
    confirmationCode: activity?.confirmationCode ?? '',
  };
}
export function activityEndDayOffset(
  fields: ActivityFields,
  day: Pick<DayContext, 'date' | 'dayNumber'>
) {
  if (fields.endDayMode === 'unknown') return null;
  if (fields.endDayMode === '0' || fields.endDayMode === '1') return Number(fields.endDayMode);
  if (fields.endDayMode !== 'other') throw new DayFormError('VALIDATION_ERROR');
  const raw = fields.endDayValue.trim();
  const offset = day.date
    ? (Date.parse(dateSchema.parse(raw)) - Date.parse(day.date)) / 86400000
    : /^-?\d+$/.test(raw)
      ? Number(raw) - day.dayNumber
      : NaN;
  return itineraryEndDayOffsetSchema.parse(offset);
}
export function validActivityEndDate(
  context: ItineraryEditContext,
  fields: ActivityFields,
  dayId: string
) {
  const day = context.days.find((d) => d.id === dayId);
  if (!day) return false;
  if (!context.capabilities?.activityEndDayOffset) return true;
  try {
    activityEndDayOffset(fields, day);
    return true;
  } catch {
    return false;
  }
}
export function prepareActivity(
  context: ItineraryEditContext,
  fields: ActivityFields,
  dayId: string,
  activityId?: string,
  remove = false
): ActivityCommand {
  const day = context.days.find((d) => d.id === dayId);
  const current = day?.activities.find((a) => a.id === activityId);
  if (!day || (activityId && !current) || (remove && !current)) throw new DayFormError('NOT_FOUND');
  const base = { client_request_id: '00000000-0000-4000-8000-000000000000', dayId };
  if (remove && current)
    return itineraryWriteInput.options[5].parse({
      ...base,
      operation: 'activity.delete',
      activityId: current.id,
      expected_activity_revision: current.revision,
    });
  const supported = context.capabilities?.activityEndDayOffset === true;
  const endDayOffset = supported ? activityEndDayOffset(fields, day) : undefined;
  if (!supported) {
    const initial = activityFields(current, day, false);
    if (
      fields.endDayMode !== initial.endDayMode ||
      (fields.endDayMode === 'other' && fields.endDayValue !== initial.endDayValue)
    )
      throw new DayFormError('FEATURE_NOT_AVAILABLE');
  }
  const location =
    !fields.place.trim() &&
    !fields.address.trim() &&
    !fields.latitude.trim() &&
    !fields.longitude.trim()
      ? null
      : {
          // Preserve non-editable metadata only when the place itself has not changed.
          ...(current?.location &&
          fields.place === current.location.name &&
          fields.latitude === String(current.location.lat) &&
          fields.longitude === String(current.location.lon)
            ? current.location
            : {}),
          name: fields.place.trim(),
          display_name: fields.address.trim(),
          lat: fields.latitude.trim() ? Number(fields.latitude) : NaN,
          lon: fields.longitude.trim() ? Number(fields.longitude) : NaN,
        };
  return itineraryWriteInput.parse({
    ...base,
    operation: current ? 'activity.update' : 'activity.create',
    ...(current ? { activityId: current.id, expected_activity_revision: current.revision } : {}),
    activity: {
      ...(supported ? { endDayOffset } : {}),
      title: fields.title,
      type: fields.type,
      time: fields.time.trim() || null,
      endTime: fields.endTime.trim() || null,
      location,
      locationName: fields.locationName,
      note: fields.note,
      confirmationCode: fields.confirmationCode,
    },
  }) as ActivityCommand;
}
export function sameActivitySnapshot(
  a: ItineraryEditContext,
  b: ItineraryEditContext,
  dayId: string,
  activityId?: string
) {
  const oldDay = a.days.find((d) => d.id === dayId),
    nextDay = b.days.find((d) => d.id === dayId);
  if (!oldDay || !nextDay) return false;
  // Day labels/date are part of the user's confirmation; unrelated activities do not conflict.
  if (
    a.capabilities?.activityEndDayOffset !== b.capabilities?.activityEndDayOffset ||
    a.startDate !== b.startDate ||
    a.endDate !== b.endDate ||
    oldDay.title !== nextDay.title ||
    oldDay.dayNumber !== nextDay.dayNumber ||
    oldDay.date !== nextDay.date
  )
    return false;
  if (!activityId) return true;
  const old = oldDay.activities.find((v) => v.id === activityId),
    next = nextDay.activities.find((v) => v.id === activityId);
  return !!old && !!next && old.revision === next.revision;
}
export function restoreActivityFields(
  command: ActivityCommand,
  context: ItineraryEditContext
): ActivityFields {
  const day = context.days.find((d) => d.id === command.dayId);
  const current = day?.activities.find(
    (a) => 'activityId' in command && a.id === command.activityId
  );
  if (command.operation === 'activity.delete')
    return activityFields(current, day, !!context.capabilities?.activityEndDayOffset);
  return activityFields(
    {
      ...command.activity,
      id: current?.id ?? '',
      revision: current?.revision ?? 0,
      endDayOffset:
        'endDayOffset' in command.activity ? command.activity.endDayOffset : current?.endDayOffset,
    },
    day,
    !!context.capabilities?.activityEndDayOffset
  );
}
