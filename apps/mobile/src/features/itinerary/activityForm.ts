import {
  itineraryWriteInput,
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
  locationName: string;
  place: string;
  address: string;
  latitude: string;
  longitude: string;
  note: string;
  confirmationCode: string;
};
export function activityFields(activity?: ActivityContext): ActivityFields {
  return {
    title: activity?.title ?? '',
    type: activity?.type ?? 'activity',
    time: activity?.time ?? '',
    endTime: activity?.endTime ?? '',
    locationName: activity?.locationName ?? '',
    place: activity?.location?.name ?? '',
    address: activity?.location?.display_name ?? '',
    latitude: activity?.location ? String(activity.location.lat) : '',
    longitude: activity?.location ? String(activity.location.lon) : '',
    note: activity?.note ?? '',
    confirmationCode: activity?.confirmationCode ?? '',
  };
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
  const current = context.days
    .find((d) => d.id === command.dayId)
    ?.activities.find((a) => 'activityId' in command && a.id === command.activityId);
  if (command.operation === 'activity.delete') return activityFields(current);
  return activityFields({
    ...command.activity,
    id: current?.id ?? '',
    revision: current?.revision ?? 0,
  });
}
