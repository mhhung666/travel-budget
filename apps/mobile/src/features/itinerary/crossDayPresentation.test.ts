import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import type { ItineraryEditContext, ItineraryActivity } from '@travel-budget/contracts';
import { messages } from '@/i18n/messages';
import { itineraryPresentationMessages } from '@/i18n/itineraryPresentationMessages';
import { activityTiming } from './presentation';
import {
  activityFields,
  activityEndDayOffset,
  prepareActivity,
  restoreActivityFields,
  sameActivitySnapshot,
} from './activityForm';
const tripId = 'a'.repeat(24),
  dayId = 'b'.repeat(24),
  activityId = 'c'.repeat(24);
const activity = {
  id: activityId,
  revision: 3,
  title: 'Flight',
  type: 'flight' as const,
  time: '22:25',
  endTime: '00:20',
  endDayOffset: 1,
  location: null,
  locationName: '',
  note: '',
  confirmationCode: '00120',
};
const context: ItineraryEditContext = {
  tripId,
  startDate: '2028-02-28',
  endDate: '2028-03-02',
  capabilities: { activityEndDayOffset: true },
  days: [
    {
      id: dayId,
      dayNumber: 2,
      date: '2028-02-29',
      title: 'Travel',
      content: '',
      location: null,
      outsideTripRange: false,
      revision: 2,
      activities: [activity],
      deleteImpact: {
        activityCount: 1,
        attachmentCount: 0,
        expenseCount: 0,
        photoCount: 0,
        revision: 'd'.repeat(64),
      },
    },
  ],
};
const fixtures = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../../../docs/design/fixtures/itinerary-cross-day.json', import.meta.url)
    ),
    'utf8'
  )
) as {
  name: string;
  input: {
    startDate: string | null;
    dayNumber: number;
    time: string | null;
    endTime: string | null;
    endDayOffset?: number | null;
  };
  expected: { startDate: string | null; endDate: string | null; endDayNumber: number | null };
}[];
it.each(fixtures)(
  'native presentation uses shared calendar fixture: $name',
  ({ input, expected }) => {
    const source = { ...activity, ...input };
    const timing = activityTiming(
      source,
      { date: expected.startDate, dayNumber: input.dayNumber },
      messages.en,
      itineraryPresentationMessages.en
    );
    expect(timing.summary).toContain(expected.startDate ?? `Day ${input.dayNumber}`);
    if (input.endTime || (input.endDayOffset != null && input.endDayOffset !== 0))
      expect(timing.summary).toContain(
        expected.endDate ??
          (expected.endDayNumber === null
            ? itineraryPresentationMessages.en.unconfirmed
            : `Day ${expected.endDayNumber}`)
      );
    expect(timing.endDate).toBe(expected.endDate);
    if (!input.time && !input.endTime) expect(timing.summary).not.toContain('00:00');
  }
);
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'has consistent translated date relations in %s',
  (locale) => {
    const copy = itineraryPresentationMessages[locale];
    const timing = activityTiming(activity, context.days[0], messages[locale], copy, context);
    expect(timing.end).toBe(`${copy.nextDay} 00:20`);
    expect(timing.summary).toContain(`${copy.departure} 2028-02-29`);
    expect(timing.summary).toContain(`${copy.arrival} 2028-03-01`);
    expect(timing.outsideRange).toBe(false);
    expect(
      activityTiming(
        { ...activity, endDayOffset: 4 },
        context.days[0],
        messages[locale],
        copy,
        context
      ).outsideRange
    ).toBe(true);
  }
);
it.each([undefined, null, 0, 1, -1, 3])(
  'round-trips offset %s through editable fields, confirmed body and rejected recovery',
  (offset) => {
    const day = context.days[0];
    const source = { ...activity, endDayOffset: offset };
    const fields = activityFields(source, day);
    expect(activityEndDayOffset(fields, day)).toBe(offset ?? null);
    const command = prepareActivity(context, fields, dayId, activityId);
    if (!('activity' in command)) throw new Error('Expected update');
    expect(command.activity.endDayOffset).toBe(offset ?? null);
    expect(restoreActivityFields(command, context)).toEqual(fields);
  }
);
it('defaults only new supported activities to same day and never infers from the clocks', () => {
  expect(activityFields(undefined, context.days[0]).endDayMode).toBe('0');
  const old = { ...activity } as Partial<typeof activity>;
  delete old.endDayOffset;
  expect(activityFields(old as typeof activity, context.days[0]).endDayMode).toBe('unknown');
  expect(
    activityTiming(
      old as ItineraryActivity,
      context.days[0],
      messages.en,
      itineraryPresentationMessages.en
    ).summary
  ).toContain('End date unconfirmed');
});
it.each(['', '2028-02-30', '2040-01-01'])(
  'rejects invalid or oversized custom calendar date %s',
  (value) => {
    expect(() =>
      prepareActivity(
        context,
        { ...activityFields(activity, context.days[0]), endDayMode: 'other', endDayValue: value },
        dayId,
        activityId
      )
    ).toThrow();
  }
);
it('allows negative local dates, relative day numbers and earlier same-day clocks', () => {
  const day = context.days[0],
    fields = activityFields(activity, day);
  expect(
    activityEndDayOffset({ ...fields, endDayMode: 'other', endDayValue: '2028-02-28' }, day)
  ).toBe(-1);
  expect(activityEndDayOffset({ ...fields, endDayMode: '0' }, day)).toBe(0);
  const undated = { ...day, date: null, dayNumber: 5 };
  expect(activityEndDayOffset({ ...fields, endDayMode: 'other', endDayValue: '-1' }, undated)).toBe(
    -6
  );
  for (const raw of ['', '2.5', '3656', '-3646'])
    expect(() =>
      activityEndDayOffset({ ...fields, endDayMode: 'other', endDayValue: raw }, undated)
    ).toThrow();
});
it('omits the new field for older backends, preserves known dates and refuses silent date changes', () => {
  const old = { ...context, capabilities: undefined },
    day = old.days[0];
  const fields = activityFields(activity, day, false);
  const command = prepareActivity(old, { ...fields, title: 'Title edit' }, dayId, activityId);
  expect('activity' in command && command.activity).not.toHaveProperty('endDayOffset');
  expect(() => prepareActivity(old, { ...fields, endDayMode: '0' }, dayId, activityId)).toThrow(
    'FEATURE_NOT_AVAILABLE'
  );
  const create = prepareActivity(
    old,
    { ...activityFields(undefined, day, false), title: 'New' },
    dayId
  );
  expect('activity' in create && create.activity).not.toHaveProperty('endDayOffset');
});
it('restores an old omitted update against the current known end date without rewriting its original body', () => {
  const oldBody = {
    operation: 'activity.update' as const,
    client_request_id: '00000000-0000-4000-8000-000000000000',
    dayId,
    activityId,
    expected_activity_revision: 1,
    activity: {
      title: 'Old edit',
      type: 'flight' as const,
      time: '22:25',
      endTime: '00:20',
      location: null,
      locationName: '',
      note: '',
      confirmationCode: '',
    },
  };
  const before = JSON.stringify(oldBody);
  const fields = restoreActivityFields(oldBody, context);
  expect(fields.endDayMode).toBe('1');
  expect(JSON.stringify(oldBody)).toBe(before);
  expect(
    sameActivitySnapshot(context, { ...context, capabilities: undefined }, dayId, activityId)
  ).toBe(false);
});

it.each([undefined, null, 0])(
  'keeps start-only entries as points, with no artificial end (%s)',
  (offset) => {
    const result = activityTiming(
      { time: '09:00', endTime: null, endDayOffset: offset },
      { dayNumber: 1, date: '2028-02-29' },
      messages.en,
      itineraryPresentationMessages.en
    );
    expect(result.compactStart).toBe('09:00');
    expect(result.compactEnd).toBeNull();
    expect(result.summary).toBe('2028-02-29 09:00');
  }
);
