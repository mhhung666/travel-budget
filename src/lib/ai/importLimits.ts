export const ITINERARY_IMPORT_LIMITS = {
  sourceCharacters: 30_000,
  days: 14,
  activitiesPerDay: 15,
  totalActivities: 120,
  sourceSummaryCharacters: 500,
  dayTitleCharacters: 200,
  dayContentCharacters: 10_000,
  activityTitleCharacters: 200,
  locationNameCharacters: 300,
  activityNoteCharacters: 5_000,
  confirmationCodeCharacters: 200,
  warnings: 200,
  warningMessageCharacters: 500,
} as const;

/** Count user-visible Unicode code points rather than UTF-16 code units. */
export function countImportCharacters(value: string): number {
  return Array.from(value).length;
}

export function isItineraryImportSourceWithinLimit(value: string): boolean {
  return countImportCharacters(value) <= ITINERARY_IMPORT_LIMITS.sourceCharacters;
}
