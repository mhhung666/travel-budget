import { itineraryImportDraftSchema, type ItineraryImportDraft } from './itineraryImportSchema';

// A clock range such as 22:25-00:20 must not match a numeric month/day.
const numericDate = /(?<![\d:])(?:(\d{4})\s*[-/.年]\s*)?(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?![\d:])/u;
const monthName =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b|\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/iu;

function hasCalendarDate(quote: string, claimedDate?: string): boolean {
  const numeric = quote.match(numericDate);
  if (numeric) {
    const [, year, month, day] = numeric;
    if (+month < 1 || +month > 12 || +day < 1 || +day > 31) return false;
    return (
      !claimedDate ||
      ((!year || claimedDate.startsWith(year + '-')) &&
        claimedDate.endsWith('-' + month.padStart(2, '0') + '-' + day.padStart(2, '0')))
    );
  }
  const named = quote.match(monthName);
  if (!named) return false;
  const month =
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
      (named[1] ?? named[4]).toLowerCase()
    ) + 1;
  const day = Number(named[2] ?? named[3]);
  return (
    day >= 1 &&
    day <= 31 &&
    (!claimedDate ||
      (Number(claimedDate.slice(5, 7)) === month && Number(claimedDate.slice(8)) === day))
  );
}
const relativeDayLabel = /\bday\s*(\d+)\b|第\s*(\d+)\s*[天日]|(\d+)\s*日目/iu;
const endRelation =
  /翌日|翌々日|隔天|次日|同日|當日|当日|next day|same day|following day|\bday\s*[+-]?\d+|\d+\s*(?:days? later|天後|天后|日後)/iu;

// Repair the unambiguous split of a single numbered leg. Separate flights, repeated
// flight numbers, an intervening activity, or independently dated days stay editable.
function joinSingleFlight(draft: ItineraryImportDraft, source: string): ItineraryImportDraft {
  if (draft.days.some((day) => day.date || day.relativeDay || !day.activities.length)) return draft;
  const flights = draft.days.flatMap((day) => day.activities);
  if (
    flights.length !== 2 ||
    flights.some((a) => a.type !== 'flight' || a.endTime || a.endDayOffset != null)
  )
    return draft;

  const departs = /起飛|起飞|出發|出发|出発|離陸|depart|take.?off/i;
  const arrives = /抵達|抵达|到着|着陸|arriv|land/i;
  if (!departs.test(source) || !arrives.test(source)) return draft;
  const flightNumber = /(?<![a-z0-9])(?:[a-z]{2}|[a-z]\d|\d[a-z])[ ]?\d{1,4}(?![a-z0-9:])/gi;
  const numbers = source.match(flightNumber);
  const times = Array.from(
    source.matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g),
    (m) => m[1].padStart(2, '0') + ':' + m[2]
  );
  if (numbers?.length !== 1 || times.length !== 2 || times[0] === times[1]) return draft;
  const number = numbers[0].toUpperCase().replace(/\s/g, '');
  if (
    !flights.every((flight) =>
      flight.title
        .match(flightNumber)
        ?.some((code) => code.toUpperCase().replace(/\s/g, '') === number)
    )
  )
    return draft;
  const departure = flights.find((a) => a.time === times[0] && departs.test(a.title));
  const arrival = flights.find((a) => a.time === times[1] && arrives.test(a.title));
  if (
    !departure ||
    !arrival ||
    (departure.confirmationCode &&
      arrival.confirmationCode &&
      departure.confirmationCode !== arrival.confirmationCode)
  )
    return draft;

  const day = draft.days.find((d) => d.activities.includes(departure))!;
  const content = draft.days
    .map((d) => d.content)
    .filter(Boolean)
    .join('\n\n');
  const merged = itineraryImportDraftSchema.safeParse({
    ...draft,
    days: [
      {
        ...day,
        ...(content ? { content } : {}),
        activities: [
          {
            ...departure,
            endTime: arrival.time,
            note: [departure.note, arrival.title, arrival.note].filter(Boolean).join('\n'),
            locationName:
              [departure.locationName, arrival.locationName].filter(Boolean).join(' → ') ||
              undefined,
            confirmationCode: departure.confirmationCode ?? arrival.confirmationCode,
          },
        ],
      },
    ],
    warnings: draft.warnings.map((warning) => ({
      ...warning,
      ...(warning.dayIndex !== undefined && { dayIndex: 0 }),
      ...(warning.activityIndex !== undefined && { activityIndex: 0 }),
    })),
  });
  return merged.success ? merged.data : draft;
}

export function groundItineraryDates(
  draft: ItineraryImportDraft,
  source: string
): ItineraryImportDraft {
  const days = draft.days.map(({ date, relativeDay, dateEvidence, ...day }) => {
    const quote =
      dateEvidence && source.includes(dateEvidence) ? dateEvidence.normalize('NFKC') : '';
    const dayLabel = quote.match(relativeDayLabel);
    const dayNumber = dayLabel && Number(dayLabel.slice(1).find(Boolean));
    return {
      ...day,
      ...(date && hasCalendarDate(quote, date) ? { date } : {}),
      ...(dayNumber && dayNumber <= 366 && (!relativeDay || relativeDay === dayNumber)
        ? { relativeDay: dayNumber }
        : {}),
      activities: day.activities.map(({ endDateEvidence, endDayOffset, ...activity }) => {
        const evidence = endDateEvidence?.trim();
        const supported =
          evidence &&
          source.includes(evidence) &&
          (hasCalendarDate(evidence.normalize('NFKC')) || endRelation.test(evidence));
        return {
          ...activity,
          ...(endDayOffset !== undefined ? { endDayOffset: supported ? endDayOffset : null } : {}),
        };
      }),
    };
  });
  return joinSingleFlight({ ...draft, days }, source);
}
