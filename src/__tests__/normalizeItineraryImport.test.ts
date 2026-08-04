import { describe, expect, it } from 'vitest';
import { normalizeItineraryImport } from '@/lib/ai/normalizeItineraryImport';
import type { ItineraryImportDraft } from '@/lib/ai/itineraryImportSchema';

const draft = (overrides: Partial<ItineraryImportDraft> = {}): ItineraryImportDraft => ({
  sourceSummary: '測試摘要',
  days: [],
  warnings: [],
  ...overrides,
});

describe('normalizeItineraryImport', () => {
  it('resolves Day N from the trip start and sorts timed activities stably', () => {
    const result = normalizeItineraryImport(
      draft({
        days: [
          {
            relativeDay: 2,
            activities: [
              { title: '自由活動', type: 'activity' },
              { title: '午餐', type: 'food', time: '12:00' },
              { title: '博物館', type: 'sightseeing', time: '09:00' },
              { title: '集合', type: 'other', time: '09:00' },
            ],
          },
        ],
      }),
      { tripStartDate: '2026-12-31', tripEndDate: '2027-01-03' }
    );

    expect(result.days[0].date).toBe('2027-01-01');
    expect(result.days[0].activities.map((activity) => activity.title)).toEqual([
      '博物館',
      '集合',
      '午餐',
      '自由活動',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('keeps an explicit date authoritative over relativeDay', () => {
    const result = normalizeItineraryImport(
      draft({
        days: [
          {
            date: '2026-09-03',
            relativeDay: 1,
            activities: [{ title: '景點', type: 'sightseeing' }],
          },
        ],
      }),
      { tripStartDate: '2026-09-01', tripEndDate: '2026-09-05' }
    );

    expect(result.days[0].date).toBe('2026-09-03');
  });

  it('adds deterministic warnings for unresolved and outside dates', () => {
    const result = normalizeItineraryImport(
      draft({
        days: [
          { relativeDay: 2, activities: [{ title: '景點', type: 'sightseeing' }] },
          {
            date: '2026-09-10',
            activities: [{ title: '回程後購物', type: 'shopping' }],
          },
          { activities: [{ title: '未知日期', type: 'other' }] },
        ],
      }),
      { tripStartDate: null, tripEndDate: '2026-09-05' }
    );

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { code: 'RELATIVE_DATE_UNRESOLVED', dayIndex: 0 },
        { code: 'DATE_OUTSIDE_TRIP', dayIndex: 1 },
        { code: 'MISSING_DATE', dayIndex: 2 },
      ])
    );
  });

  it('marks an existing day and normalized duplicate title without overwriting data', () => {
    const result = normalizeItineraryImport(
      draft({
        days: [
          {
            date: '2026-09-01',
            activities: [
              { title: '東京・車站！', type: 'sightseeing', time: '09:00' },
              { title: '東京車站', type: 'sightseeing', time: '09:00' },
            ],
          },
        ],
      }),
      {
        tripStartDate: '2026-09-01',
        tripEndDate: '2026-09-03',
        existingDays: [
          {
            date: '2026-09-01',
            activities: [{ title: '東京 車站', time: '09:00' }],
          },
        ],
      }
    );

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { code: 'EXISTING_DAY_APPEND', dayIndex: 0 },
        { code: 'POSSIBLE_DUPLICATE', dayIndex: 0, activityIndex: 0 },
        { code: 'POSSIBLE_DUPLICATE', dayIndex: 0, activityIndex: 1 },
      ])
    );
    expect(result.days[0].activities).toHaveLength(2);
  });

  it('warns about an end time before the start time', () => {
    const result = normalizeItineraryImport(
      draft({
        days: [
          {
            date: '2026-09-01',
            activities: [{ title: '夜間航班', type: 'flight', time: '23:40', endTime: '05:55' }],
          },
        ],
      }),
      { tripStartDate: '2026-09-01', tripEndDate: '2026-09-03' }
    );

    expect(result.warnings).toContainEqual({
      code: 'END_TIME_BEFORE_START',
      dayIndex: 0,
      activityIndex: 0,
    });
  });

  it('does not mutate the model draft or leak confirmation codes into generated warnings', () => {
    const input = draft({
      days: [
        {
          activities: [
            {
              title: '飯店入住',
              type: 'accommodation',
              confirmationCode: 'TEST-SECRET-NOT-REAL',
            },
          ],
        },
      ],
    });
    const before = structuredClone(input);
    const result = normalizeItineraryImport(input, {});

    expect(input).toEqual(before);
    expect(JSON.stringify(result.warnings)).not.toContain('TEST-SECRET-NOT-REAL');
    expect(result.days[0].activities[0].confirmationCode).toBe('TEST-SECRET-NOT-REAL');
  });
});
