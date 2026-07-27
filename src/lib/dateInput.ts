/**
 * Convert a Date to the value expected by `<input type="date">` using the
 * device's local calendar date. `toISOString().slice(0, 10)` is UTC-based and
 * can return yesterday during the morning in UTC+ time zones.
 *
 * `timezoneOffsetMinutes` is injectable so the timezone boundary can be tested
 * without changing the test runner's process timezone.
 */
export function toLocalDateInputValue(
  date: Date = new Date(),
  timezoneOffsetMinutes: number = date.getTimezoneOffset()
): string {
  const localTime = date.getTime() - timezoneOffsetMinutes * 60_000;
  return new Date(localTime).toISOString().slice(0, 10);
}

/**
 * Preserve date-only values received from DTOs; otherwise convert a timestamp
 * to the local calendar date used by a date input.
 */
export function toDateInputValue(value: string | number | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return toLocalDateInputValue(value instanceof Date ? value : new Date(value));
}
