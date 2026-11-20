import { describe, expect, it } from 'vitest';
import { groundItineraryDates } from '@/lib/ai/itineraryImportEvidence';
import { normalizeItineraryImport } from '@/lib/ai/normalizeItineraryImport';
import {
  createItineraryImportPreview,
  validateItineraryImportPreview,
  toItineraryImportDraft,
} from '@/lib/ai/itineraryImportPreview';
import type { ItineraryImportDraft } from '@/lib/ai/itineraryImportSchema';

// Replay the two rows and incorrect dates returned by the live provider for CD402.
const source = '測試航班 CD402，22:25 台北起飛，00:20 香港抵達。';
const split: ItineraryImportDraft = {
  sourceSummary: '',
  days: [
    {
      date: '2028-02-28',
      activities: [
        { time: '22:25', title: '航班 CD402 自台北起飛', type: 'flight', locationName: '台北' },
      ],
    },
    {
      date: '2028-02-29',
      activities: [
        { time: '00:20', title: '航班 CD402 抵達香港', type: 'flight', locationName: '香港' },
      ],
    },
  ],
  warnings: [
    { code: 'DATE_OUTSIDE_TRIP', dayIndex: 1, activityIndex: 0 },
    { code: 'EXISTING_DAY_APPEND', dayIndex: 0 },
  ],
};
const trip = { startDate: '2028-02-28', endDate: '2028-03-01', existingDates: ['2028-02-28'] };
describe('source evidence for imported flights', () => {
  it('keeps both clocks on one undated flight until the user selects the departure date', () => {
    const normalized = normalizeItineraryImport(groundItineraryDates(split, source), {
      tripStartDate: trip.startDate,
      tripEndDate: trip.endDate,
    });
    expect(normalized.warnings.map((w) => w.code)).toEqual([
      'MISSING_DATE',
      'END_TIME_BEFORE_START',
    ]);
    const preview = createItineraryImportPreview(normalized, trip);
    expect(preview.days).toHaveLength(1);
    expect(preview.days[0]).toMatchObject({
      included: true,
      date: '',
      activities: [{ time: '22:25', endTime: '00:20', locationName: '台北 → 香港' }],
    });
    expect(validateItineraryImportPreview(preview, trip)).toContainEqual({
      code: 'MISSING_DATE',
      dayIndex: 0,
    });
    preview.days[0].date = trip.startDate;
    expect(validateItineraryImportPreview(preview, trip)).toEqual([]);
    expect(toItineraryImportDraft(preview)?.days[0].activities[0].endDayOffset ?? null).toBeNull();
    preview.days[0].date = '2028-02-29';
    expect(validateItineraryImportPreview(preview, trip)).toContainEqual({
      code: 'MISSING_DAY_TITLE',
      dayIndex: 0,
    });
  });
  it('derives inclusion from trip dates even if the model flags an in-range day', () => {
    const draft = { ...split, days: [{ ...split.days[0], date: '2028-03-02' }, split.days[1]] };
    expect(createItineraryImportPreview(draft, trip).days.map((d) => d.included)).toEqual([
      false,
      true,
    ]);
    expect(
      normalizeItineraryImport(draft, { tripStartDate: trip.startDate, tripEndDate: trip.endDate })
        .warnings
    ).toEqual([{ code: 'DATE_OUTSIDE_TRIP', dayIndex: 0 }]);
  });
  it.each([
    'CD402 台北起飛 22:25、CD403 香港抵達 00:20',
    'CD402 22:25 台北起飛，CD402 00:20 香港抵達',
  ])('keeps separate legs for %s', (text) => {
    expect(groundItineraryDates(split, text).days).toHaveLength(2);
  });
  it('requires the exact flight number in both rows', () => {
    expect(groundItineraryDates(split, source.replace('CD402', 'CD40')).days).toHaveLength(2);
  });
  it.each([
    ['2028-02-28', '2028-02-28', '2028-02-28'],
    ['2 月 28 日', '2 月 28 日', '2028-02-28'],
    ['February 28', 'February 28', '2028-02-28'],
    ['2028-02-29', '2028-02-29', undefined],
    ['22:25–00:20', '2028-02-28', undefined],
    ['22:25-00:20', '22:25-00:20', undefined],
  ])('uses the quoted departure date from %s', (text, dateEvidence, expected) => {
    const draft = { ...split, days: [{ ...split.days[0], dateEvidence }] };
    expect(groundItineraryDates(draft, text!).days[0].date).toBe(expected);
  });
  it.each(['Day 2', '第 2 天', '2日目'])(
    'resolves an explicit relative day %s against the trip start',
    (text) => {
      const draft = { ...split, days: [{ ...split.days[0], dateEvidence: text, relativeDay: 2 }] };
      const result = normalizeItineraryImport(groundItineraryDates(draft, text), {
        tripStartDate: trip.startDate,
      });
      expect(result.days[0].date).toBe('2028-02-29');
    }
  );
});
