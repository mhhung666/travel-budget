import { describe, expect, it } from 'vitest';
import { itineraryImportFixtures } from '@/__fixtures__/ai/itineraryImportFixtures';
import { ITINERARY_IMPORT_LIMITS, countImportCharacters } from '@/lib/ai/importLimits';
import {
  ITINERARY_IMPORT_ERROR_CODES,
  itineraryImportDraftSchema,
  itineraryImportRequestSchema,
} from '@/lib/ai/itineraryImportSchema';

const validActivity = { title: '參觀博物館', type: 'sightseeing' as const };

describe('itineraryImportDraftSchema', () => {
  it('keeps at least 30 anonymous fixtures valid without calling a model', () => {
    expect(itineraryImportFixtures.length).toBeGreaterThanOrEqual(30);

    for (const sample of itineraryImportFixtures) {
      expect(
        itineraryImportDraftSchema.safeParse(sample.expected),
        `fixture ${sample.id} should be valid`
      ).toMatchObject({ success: true });
    }
  });

  it('covers the required input formats and edge cases', () => {
    const tags = new Set(itineraryImportFixtures.flatMap((sample) => sample.tags));
    for (const requiredTag of [
      'markdown-table',
      'bullet-list',
      'paragraph',
      'day-number',
      'full-date',
      'cross-year',
      'missing-time',
      'duplicate',
      'outside-range',
    ]) {
      expect(tags, `missing fixture tag: ${requiredTag}`).toContain(requiredTag);
    }
  });

  it('defines stable error codes for the parsing endpoint', () => {
    expect(ITINERARY_IMPORT_ERROR_CODES).toEqual([
      'UNAUTHENTICATED',
      'TRIP_NOT_FOUND',
      'FORBIDDEN',
      'FEATURE_DISABLED',
      'INVALID_REQUEST',
      'SOURCE_TOO_LONG',
      'RATE_LIMITED',
      'PROVIDER_TIMEOUT',
      'INVALID_MODEL_OUTPUT',
      'MODEL_OUTPUT_LIMIT',
      'INTERNAL_ERROR',
    ]);
  });

  it('does not include direct personal identifiers or usable confirmation codes in fixtures', () => {
    const serialized = JSON.stringify(itineraryImportFixtures);
    expect(serialized).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    expect(serialized).not.toMatch(/(?:邀請碼|訂位代號|確認碼|PNR)\s*[:：]\s*[A-Z0-9]{5,}/i);
  });

  it('trims semantic strings and applies defaults', () => {
    expect(
      itineraryImportDraftSchema.parse({
        days: [
          {
            date: '2026-09-01',
            title: '  第一天  ',
            activities: [{ ...validActivity, title: '  參觀博物館  ', note: '  慢慢逛  ' }],
          },
        ],
      })
    ).toEqual({
      sourceSummary: '',
      days: [
        {
          date: '2026-09-01',
          title: '第一天',
          activities: [{ ...validActivity, title: '參觀博物館', note: '慢慢逛' }],
        },
      ],
      warnings: [],
    });
  });

  it.each([
    ['nonexistent date', { date: '2026-02-30', activities: [validActivity] }],
    ['non-padded date', { date: '2026-2-03', activities: [validActivity] }],
    ['invalid time', { date: '2026-02-03', activities: [{ ...validActivity, time: '25:00' }] }],
    ['unknown type', { date: '2026-02-03', activities: [{ title: '移動', type: 'transport' }] }],
  ])('rejects %s', (_label, day) => {
    expect(itineraryImportDraftSchema.safeParse({ days: [day] }).success).toBe(false);
  });

  it('rejects model-invented fields such as coordinates or database ids', () => {
    expect(
      itineraryImportDraftSchema.safeParse({
        days: [
          {
            date: '2026-09-01',
            activities: [{ ...validActivity, latitude: 25.04, mongoId: 'not-allowed' }],
          },
        ],
      }).success
    ).toBe(false);
  });

  it('enforces per-day and total activity limits', () => {
    const tooManyInOneDay = Array.from(
      { length: ITINERARY_IMPORT_LIMITS.activitiesPerDay + 1 },
      (_, index) => ({ ...validActivity, title: `活動 ${index}` })
    );
    expect(
      itineraryImportDraftSchema.safeParse({
        days: [{ date: '2026-09-01', activities: tooManyInOneDay }],
      }).success
    ).toBe(false);

    const daysOverTotal = Array.from({ length: 14 }, (_, dayIndex) => ({
      relativeDay: dayIndex + 1,
      activities: Array.from({ length: 9 }, (_, activityIndex) => ({
        ...validActivity,
        title: `活動 ${dayIndex}-${activityIndex}`,
      })),
    }));
    expect(daysOverTotal.flatMap((day) => day.activities)).toHaveLength(126);
    expect(itineraryImportDraftSchema.safeParse({ days: daysOverTotal }).success).toBe(false);
  });
});

describe('itineraryImportRequestSchema', () => {
  it('counts Unicode code points consistently', () => {
    expect(countImportCharacters('台灣✈️')).toBe(4);
  });

  it('accepts exactly the source limit and rejects one character more', () => {
    const atLimit = '行'.repeat(ITINERARY_IMPORT_LIMITS.sourceCharacters);
    expect(
      itineraryImportRequestSchema.safeParse({ tripId: 'trip-id', sourceText: atLimit }).success
    ).toBe(true);
    expect(
      itineraryImportRequestSchema.safeParse({ tripId: 'trip-id', sourceText: `${atLimit}程` })
        .success
    ).toBe(false);
  });

  it('rejects blank input and unknown request fields', () => {
    expect(
      itineraryImportRequestSchema.safeParse({ tripId: 'trip-id', sourceText: '   ' }).success
    ).toBe(false);
    expect(
      itineraryImportRequestSchema.safeParse({
        tripId: 'trip-id',
        sourceText: 'Day 1 去公園',
        writeDirectly: true,
      }).success
    ).toBe(false);
  });
});
