// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  itineraryActivityTiming,
  itineraryActivityInput,
  itineraryActivitySchema,
  itineraryWriteInput,
  itineraryEditContextSchema,
  activityDeletionPreviewInput,
  activityDeletionPreviewSchema,
  itineraryWriteStateSchema,
} from '@travel-budget/contracts';
import { activitySchema } from '@/lib/validation';
import { toDayDto, type LeanDay } from '@/lib/itineraryRead';
import { projectMobileItinerary } from '@/lib/itineraryProjection';
const fixtures = JSON.parse(
  readFileSync(
    new URL('../../../../docs/design/fixtures/itinerary-cross-day.json', import.meta.url),
    'utf8'
  )
) as {
  name: string;
  input: Parameters<typeof itineraryActivityTiming>[0];
  expected: ReturnType<typeof itineraryActivityTiming>;
}[];
const activity = {
  title: 'Flight',
  type: 'flight' as const,
  time: '22:25',
  endTime: '00:20',
  location: null,
  locationName: '',
  note: '',
  confirmationCode: 'PRIVATE',
};
const id = 'a'.repeat(24);
it.each(fixtures)('shared date-only fixture: $name', ({ input, expected }) => {
  expect(itineraryActivityTiming(input)).toEqual(expected);
});
it.each([-3651, 3651, 0.5, NaN, Infinity, '1'])(
  'rejects unsupported offsets %s on Web and native',
  (endDayOffset) => {
    expect(itineraryActivityInput.safeParse({ ...activity, endDayOffset }).success).toBe(false);
    expect(
      activitySchema.safeParse({ title: 'Flight', end_day_offset: endDayOffset }).success
    ).toBe(false);
  }
);
it.each([-3650, 3650, -1, 0, 1, null])(
  'accepts signed/unknown offsets %s without comparing clocks',
  (endDayOffset) => {
    expect(itineraryActivityInput.parse({ ...activity, endDayOffset }).endDayOffset).toBe(
      endDayOffset
    );
  }
);
it('keeps omitted frozen command fields unchanged and distinguishes explicit null/0', () => {
  const body = {
    client_request_id: '12345678-1234-4234-8234-123456789abc',
    operation: 'activity.create',
    dayId: id,
    activity,
  };
  const parsed = itineraryWriteInput.parse(body);
  expect(parsed).toEqual(body);
  expect(JSON.stringify(parsed)).not.toContain('endDayOffset');
  for (const value of [null, 0, 1]) {
    const next = { ...body, activity: { ...activity, endDayOffset: value } };
    expect(itineraryWriteInput.parse(next)).toEqual(next);
  }
});
it('new readers parse old contexts/receipts without inventing a capability or changing history', () => {
  const context = { tripId: id, startDate: null, endDate: null, days: [] };
  expect(itineraryEditContextSchema.parse(context)).toEqual(context);
  const receipt = {
    status: 'committed',
    client_request_id: '12345678-1234-4234-8234-123456789abc',
    tripId: id,
    operation: 'activity.update',
    result: { dayId: id, dayRevision: 2, activityId: id, activityRevision: 1, deleted: false },
  };
  expect(itineraryWriteStateSchema.parse(receipt)).toEqual(receipt);
});
it('old read decoders strip additive dates while old strict preview decoders still accept the default shape', () => {
  const oldActivity = itineraryActivitySchema.omit({ endDayOffset: true });
  expect(oldActivity.parse({ id, ...activity, endDayOffset: 1 })).not.toHaveProperty(
    'endDayOffset'
  );
  const oldTargets = activityDeletionPreviewSchema.shape.targets.element
    .omit({ endDayOffset: true })
    .strict();
  const target = {
    activityId: id,
    revision: 0,
    title: 'Flight',
    time: '22:25',
    endTime: '00:20',
    locationName: '',
  };
  expect(oldTargets.parse(target)).toEqual(target);
  expect(oldTargets.safeParse({ ...target, endDayOffset: 1 }).success).toBe(false);
  const input = { dayId: id, targets: [{ activityId: id, expectedRevision: 0 }] };
  expect(activityDeletionPreviewInput.parse(input)).toEqual(input);
  expect(
    activityDeletionPreviewInput.parse({ ...input, includeEndDayOffset: true })
  ).toHaveProperty('includeEndDayOffset', true);
});
it('member/public/native projections preserve explicit dates and never infer unknown dates or leak tickets', () => {
  const raw = {
    _id: id,
    trip: id,
    revision: 0,
    dayNumber: 1,
    title: 'Travel',
    content: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    activities: [0, 1, -1, null, undefined].map((offset, i) => ({
      _id: String(i).padStart(24, 'a'),
      revision: 0,
      ...activity,
      endDayOffset: offset,
      attachments: [
        {
          key: 'private-ticket',
          contentType: 'image/png',
          size: 1,
          uploadedBy: id,
          uploadedAt: new Date(),
        },
      ],
    })),
  } as unknown as LeanDay;
  const member = toDayDto(raw);
  expect(member.activities.map((a) => a.end_day_offset)).toEqual([0, 1, -1, null, null]);
  const publicDay = toDayDto(raw, false);
  expect(publicDay.activities.map((a) => a.end_day_offset)).toEqual([0, 1, -1, null, null]);
  expect(JSON.stringify(publicDay)).not.toMatch(/PRIVATE|private-ticket/);
  const mobile = projectMobileItinerary(id, { startDate: new Date('2026-01-12') }, [member]);
  expect(mobile.days[0].activities.map((a) => a.endDayOffset)).toEqual([0, 1, -1, null, null]);
  expect(JSON.stringify(mobile)).not.toContain('private-ticket');
});
describe('migration', () => {
  it('backfills only missing values to null and is idempotent/reversible without guessing clocks', async () => {
    const { up, down } =
      await import('../../migrations/20261106120000-itinerary-end-day-offset.js');
    const rows: { endDayOffset?: number | null; time?: string; endTime?: string }[] = [
      { time: '22:25', endTime: '00:20' },
      { endDayOffset: 1 },
      { endDayOffset: 0 },
      { endDayOffset: -1 },
      { endDayOffset: null },
    ];
    const db = {
      collection: (name: string) => {
        expect(name).toBe('itinerarydays');
        return {
          updateMany: async (
            filter: unknown,
            update: { $set?: unknown; $unset?: unknown },
            options?: unknown
          ) => {
            if (update.$set) {
              expect(filter).toEqual({
                activities: { $elemMatch: { endDayOffset: { $exists: false } } },
              });
              expect(options).toEqual({
                arrayFilters: [{ 'activity.endDayOffset': { $exists: false } }],
              });
              for (const a of rows) if (!Object.hasOwn(a, 'endDayOffset')) a.endDayOffset = null;
            } else {
              expect(update.$unset).toEqual({ 'activities.$[].endDayOffset': '' });
              for (const a of rows) delete a.endDayOffset;
            }
          },
        };
      },
    };
    await up(db);
    await up(db);
    expect(rows.map((a) => a.endDayOffset)).toEqual([null, 1, 0, -1, null]);
    await down(db);
    await down(db);
    expect(rows.every((a) => !Object.hasOwn(a, 'endDayOffset'))).toBe(true);
  });
});
