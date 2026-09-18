import { itineraryPdfMarkdown, type PdfBlock } from './itineraryPdfMarkdown';
import type { ActivityType, ItineraryDay, Trip } from '@/types';
import { sortActivities } from '@/lib/itineraryActivities';
import { dateForDayNumber, toDateOnly } from '@/lib/itineraryDayTarget';
import { intlLocale } from '@/lib/relativeTime';

export interface PdfLabels {
  day: string;
  generated: string;
  range: string;
  outsideRange: string;
  end: string;
  confirmation: string;
  imageOmitted: string;
  types: Record<ActivityType, string>;
}
export interface PdfOptions {
  dayIds: string[];
  includeNotes: boolean;
  includeConfirmation: boolean;
}
export interface ItineraryPdfModel {
  name: string;
  dates: string;
  generated: string;
  locale: string;
  labels: PdfLabels;
  days: {
    heading: string;
    location: string;
    content: PdfBlock[];
    activities: {
      title: string;
      time: string;
      type: string;
      location: string;
      note: string;
      confirmation: string;
    }[];
  }[];
}

/** Explicit projection: no attachment URLs, share codes or other private DTO fields. */
export function buildItineraryPdfModel(
  trip: Pick<Trip, 'name' | 'start_date' | 'end_date'>,
  days: ItineraryDay[],
  options: PdfOptions,
  isMember: boolean,
  locale: string,
  labels: PdfLabels,
  now = new Date()
): ItineraryPdfModel {
  const selected = new Set(options.dayIds);
  const start = toDateOnly(trip.start_date);
  const end = toDateOnly(trip.end_date);
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  });
  const formatDate = (date: string) => dateFormat.format(new Date(`${date}T00:00:00Z`));
  const chosen = days
    .filter((day) => selected.has(day.id))
    .sort((a, b) => a.day_number - b.day_number);
  // A removed day must not silently disappear from an explicitly selected export.
  if (!chosen.length || chosen.length !== selected.size) throw new Error('PDF_SELECTION_CHANGED');
  return {
    name: trip.name,
    dates: [start && formatDate(start), end && formatDate(end)].filter(Boolean).join(' – '),
    generated: new Intl.DateTimeFormat(intlLocale(locale), {
      dateStyle: 'medium',
      timeStyle: 'long',
    }).format(now),
    locale: intlLocale(locale),
    labels,
    days: chosen.map((day) => {
      const date = start ? dateForDayNumber(start, day.day_number) : null;
      return {
        heading: `${labels.day.replace('{n}', String(day.day_number))}${date ? ` · ${formatDate(date)}` : ''}${day.title ? ` · ${day.title}` : ''}${date && end && date > end ? ` (${labels.outsideRange})` : ''}`,
        location: day.location?.name ?? '',
        content: options.includeNotes ? itineraryPdfMarkdown(day.content, labels.imageOmitted) : [],
        activities: sortActivities(day.activities ?? []).map((activity) => ({
          title: activity.title,
          time: activity.time
            ? `${activity.time}${activity.end_time ? ` – ${activity.end_time}` : ''}`
            : activity.end_time
              ? `${labels.end} ${activity.end_time}`
              : '',
          type: labels.types[activity.type] ?? labels.types.other,
          location: activity.location?.name || activity.location_name || '',
          note: activity.note,
          confirmation: isMember && options.includeConfirmation ? activity.confirmation_code : '',
        })),
      };
    }),
  };
}
