import {
  itineraryWriteInput,
  itineraryDayTargetInput,
  type ItineraryEditContext,
  type ItineraryWriteInput,
} from '@travel-budget/contracts';

export type DayContext = ItineraryEditContext['days'][number];
export type DayCommand = Extract<ItineraryWriteInput, { operation: `day.${string}` }>;
export type DayFields = {
  title: string;
  content: string;
  date: string;
  dayNumber: string;
  place: string;
  address: string;
  latitude: string;
  longitude: string;
};
const validationId = '00000000-0000-4000-8000-000000000000';
export function dayFields(context: ItineraryEditContext, day?: DayContext): DayFields {
  let next = 1;
  while (context.days.some((d) => d.dayNumber === next)) next++;
  const date = context.startDate
    ? new Date(Date.parse(`${context.startDate}T00:00:00Z`) + (next - 1) * 86400000)
        .toISOString()
        .slice(0, 10)
    : '';
  return {
    title: day?.title ?? '',
    content: day?.content ?? '',
    date: day?.date ?? date,
    dayNumber: String(day?.dayNumber ?? next),
    place: day?.location?.name ?? '',
    address: day?.location?.display_name ?? '',
    latitude: day?.location ? String(day.location.lat) : '',
    longitude: day?.location ? String(day.location.lon) : '',
  };
}
export class DayFormError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function prepareDay(
  context: ItineraryEditContext,
  fields: DayFields,
  day?: DayContext,
  remove = false
): DayCommand {
  if (remove) {
    if (!day) throw new DayFormError('NOT_FOUND');
    return itineraryWriteInput.options[2].parse({
      operation: 'day.delete',
      client_request_id: validationId,
      dayId: day.id,
      expected_revision: day.revision,
      expected_impact_revision: day.deleteImpact.revision,
    });
  }
  const location =
    fields.latitude.trim() === '' &&
    fields.longitude.trim() === '' &&
    !fields.place.trim() &&
    !fields.address.trim()
      ? null
      : {
          name: fields.place.trim(),
          display_name: fields.address.trim(),
          lat: fields.latitude.trim() === '' ? NaN : Number(fields.latitude),
          lon: fields.longitude.trim() === '' ? NaN : Number(fields.longitude),
          ...(day?.location?.names && fields.place === day.location.name
            ? { names: day.location.names }
            : {}),
        };
  const initial = dayFields(context, day);
  const moved =
    !day ||
    (context.startDate ? fields.date !== initial.date : fields.dayNumber !== initial.dayNumber);
  let target;
  if (moved) {
    if (!context.startDate && !/^[1-9]\d*$/.test(fields.dayNumber))
      throw new DayFormError('VALIDATION_ERROR');
    target = itineraryDayTargetInput.parse(
      context.startDate
        ? {
            date: fields.date,
            expected_start_date: context.startDate,
            expected_end_date: context.endDate,
          }
        : {
            day_number: Number(fields.dayNumber),
            expected_start_date: null,
            expected_end_date: context.endDate,
          }
    );
    const n =
      'date' in target
        ? Math.round((Date.parse(target.date) - Date.parse(context.startDate!)) / 86400000) + 1
        : target.day_number;
    if (n < 1 || ('date' in target && context.endDate && target.date > context.endDate))
      throw new DayFormError('DATE_OUTSIDE_TRIP');
    if (context.days.some((d) => d.id !== day?.id && d.dayNumber === n))
      throw new DayFormError('DAY_ALREADY_EXISTS');
  }
  return itineraryWriteInput.parse({
    client_request_id: validationId,
    operation: day ? 'day.update' : 'day.create',
    ...(day ? { dayId: day.id, expected_revision: day.revision } : {}),
    title: fields.title,
    content: fields.content,
    location,
    ...(target ? { target } : {}),
  }) as DayCommand;
}
export function sameDaySnapshot(
  a: ItineraryEditContext,
  b: ItineraryEditContext,
  dayId?: string,
  checkImpact = false
) {
  if (a.startDate !== b.startDate || a.endDate !== b.endDate) return false;
  if (!dayId) return true;
  const old = a.days.find((d) => d.id === dayId),
    next = b.days.find((d) => d.id === dayId);
  return (
    !!old &&
    !!next &&
    old.revision === next.revision &&
    (!checkImpact || old.deleteImpact.revision === next.deleteImpact.revision)
  );
}
export function restoreDayFields(context: ItineraryEditContext, command: DayCommand): DayFields {
  const day = 'dayId' in command ? context.days.find((d) => d.id === command.dayId) : undefined;
  const fields = dayFields(context, day);
  if (command.operation === 'day.delete') return fields;
  return {
    ...fields,
    title: command.title,
    content: command.content,
    ...(command.target && 'date' in command.target ? { date: command.target.date } : {}),
    ...(command.target && 'day_number' in command.target
      ? { dayNumber: String(command.target.day_number) }
      : {}),
    place: command.location?.name ?? '',
    address: command.location?.display_name ?? '',
    latitude: command.location ? String(command.location.lat) : '',
    longitude: command.location ? String(command.location.lon) : '',
  };
}
