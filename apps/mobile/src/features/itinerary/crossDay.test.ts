import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { itineraryActivityTiming, itineraryEditContextSchema } from '@travel-budget/contracts';
const fixtures = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../../../docs/design/fixtures/itinerary-cross-day.json', import.meta.url)
    ),
    'utf8'
  )
) as {
  name: string;
  input: Parameters<typeof itineraryActivityTiming>[0];
  expected: ReturnType<typeof itineraryActivityTiming>;
}[];
it.each(fixtures)('shared native date-only fixture: $name', ({ input, expected }) => {
  expect(itineraryActivityTiming(input)).toEqual(expected);
});
it('an old backend context has no cross-day write capability, while a new one advertises support', () => {
  const old = { tripId: 'a'.repeat(24), startDate: null, endDate: null, days: [] };
  expect(itineraryEditContextSchema.parse(old).capabilities?.activityEndDayOffset).toBeUndefined();
  expect(
    itineraryEditContextSchema.parse({ ...old, capabilities: { activityEndDayOffset: true } })
      .capabilities?.activityEndDayOffset
  ).toBe(true);
});
