import { describe, expect, it } from 'vitest';
import {
  createItineraryImportPreview,
  toItineraryImportDraft,
  validateItineraryImportPreview,
} from '@/lib/ai/itineraryImportPreview';
import type { ItineraryImportDraft } from '@/lib/ai/itineraryImportSchema';

const draft: ItineraryImportDraft = {
  sourceSummary: 'Tokyo trip',
  days: [
    {
      date: '2026-09-10',
      title: 'Arrival',
      activities: [
        {
          time: '14:00',
          endTime: '13:00',
          title: 'Airport train',
          type: 'ground_transport',
          confirmationCode: 'SECRET-123',
        },
      ],
    },
    {
      date: '2026-10-01',
      title: 'Outside day',
      activities: [{ title: 'Museum', type: 'sightseeing' }],
    },
  ],
  warnings: [
    { code: 'END_TIME_BEFORE_START', dayIndex: 0, activityIndex: 0 },
    { code: 'POSSIBLE_DUPLICATE', dayIndex: 0, activityIndex: 0 },
    { code: 'DATE_OUTSIDE_TRIP', dayIndex: 1 },
  ],
};

describe('itinerary import preview', () => {
  it('starts outside-range days unchecked and reports editable blocking fields', () => {
    const preview = createItineraryImportPreview(draft);

    expect(preview.days[0].included).toBe(true);
    expect(preview.days[1].included).toBe(false);
    expect(
      validateItineraryImportPreview(preview, {
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      })
    ).toEqual([{ code: 'END_TIME_BEFORE_START', dayIndex: 0, activityIndex: 0 }]);
  });

  it('clears a time blocker after the user fixes the end time', () => {
    const preview = createItineraryImportPreview(draft);
    preview.days[0].activities[0].endTime = '15:00';

    expect(
      validateItineraryImportPreview(preview, {
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      })
    ).toEqual([]);
  });

  it('requires a title for new dates but not dates that append to an existing day', () => {
    const withoutTitle: ItineraryImportDraft = {
      sourceSummary: '',
      days: [{ date: '2026-09-10', activities: [] }],
      warnings: [],
    };
    const newPreview = createItineraryImportPreview(withoutTitle);
    expect(validateItineraryImportPreview(newPreview)).toContainEqual({
      code: 'MISSING_DAY_TITLE',
      dayIndex: 0,
    });

    withoutTitle.warnings = [{ code: 'EXISTING_DAY_APPEND', dayIndex: 0 }];
    expect(validateItineraryImportPreview(createItineraryImportPreview(withoutTitle))).toEqual([]);
  });

  it('removes excluded rows and reindexes non-blocking warnings', () => {
    const preview = createItineraryImportPreview({
      sourceSummary: '',
      days: [
        { date: '2026-09-10', title: 'Skip', activities: [] },
        {
          date: '2026-09-11',
          title: 'Keep',
          activities: [
            { title: 'Skip activity', type: 'other' },
            { title: 'Keep activity', type: 'food' },
          ],
        },
      ],
      warnings: [{ code: 'POSSIBLE_DUPLICATE', dayIndex: 1, activityIndex: 1 }],
    });
    preview.days[0].included = false;
    preview.days[1].activities[0].included = false;

    expect(toItineraryImportDraft(preview)).toEqual({
      sourceSummary: '',
      days: [
        {
          date: '2026-09-11',
          title: 'Keep',
          activities: [{ title: 'Keep activity', type: 'food' }],
        },
      ],
      warnings: [{ code: 'POSSIBLE_DUPLICATE', dayIndex: 0, activityIndex: 0 }],
    });
  });
});
