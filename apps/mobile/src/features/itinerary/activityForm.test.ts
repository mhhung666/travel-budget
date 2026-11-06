import { expect, it } from 'vitest';
import { itineraryWriteInput, type ItineraryEditContext } from '@travel-budget/contracts';
import { messages } from '@/i18n/messages';
import { activityMessages, activityRejection } from '@/i18n/activityMessages';
import { activityType } from './presentation';
import {
  activityFields,
  prepareActivity,
  restoreActivityFields,
  sameActivitySnapshot,
} from './activityForm';
const tripId = 'a'.repeat(24),
  dayId = 'b'.repeat(24),
  activityId = 'c'.repeat(24);
const activity = {
  id: activityId,
  revision: 7,
  title: 'Dinner',
  type: 'transport' as const,
  time: null,
  endTime: '01:00',
  locationName: 'Platform 1',
  note: 'Private\nnotes',
  confirmationCode: '00120',
  location: {
    name: 'Station',
    names: { en: 'Station', jp: '駅' },
    display_name: 'Address',
    lat: 35,
    lon: 139,
    country: 'Japan',
    country_code: 'jp',
  },
};
const context: ItineraryEditContext = {
  tripId,
  capabilities: { activityEndDayOffset: true },
  startDate: '2026-11-03',
  endDate: '2026-11-05',
  days: [
    {
      id: dayId,
      dayNumber: 1,
      date: '2026-11-03',
      outsideTripRange: false,
      title: 'First day',
      content: 'Day notes',
      location: null,
      revision: 10,
      deleteImpact: {
        revision: 'a'.repeat(64),
        activityCount: 1,
        attachmentCount: 2,
        expenseCount: 1,
        photoCount: 1,
      },
      activities: [activity],
    },
  ],
};
it('creates optional times without ticket or AI fields, and updates only the identified activity', () => {
  const created = prepareActivity(context, { ...activityFields(), title: 'Walk' }, dayId);
  expect(created).toMatchObject({
    operation: 'activity.create',
    dayId,
    activity: { time: null, endTime: null, location: null },
  });
  const update = prepareActivity(
    context,
    { ...activityFields(activity), title: 'Railway' },
    dayId,
    activityId
  );
  expect(update).toMatchObject({
    operation: 'activity.update',
    dayId,
    activityId,
    expected_activity_revision: 7,
    activity: {
      title: 'Railway',
      type: 'transport',
      time: null,
      endTime: '01:00',
      confirmationCode: '00120',
      location: activity.location,
    },
  });
  expect(Object.keys(update)).not.toContain('activities');
  if ('activity' in update)
    expect(Object.keys(update.activity).sort()).toEqual(
      [
        'title',
        'type',
        'time',
        'endTime',
        'endDayOffset',
        'location',
        'locationName',
        'note',
        'confirmationCode',
      ].sort()
    );
  expect(itineraryWriteInput.parse(update)).toEqual(update);
});
it.each([
  'sightseeing',
  'food',
  'flight',
  'ground_transport',
  'transport',
  'accommodation',
  'shopping',
  'activity',
  'other',
] as const)('preserves type %s including the legacy transport value', (type) => {
  const result = prepareActivity(context, { ...activityFields(activity), type }, dayId, activityId);
  expect('activity' in result && result.activity.type).toBe(type);
  for (const locale of ['zh', 'zh-CN', 'en', 'jp'] as const)
    expect(activityType(type, messages[locale])).toBeTruthy();
});
it('allows overnight / end-only times and treats empty times as null', () => {
  const result = prepareActivity(
    context,
    { ...activityFields(activity), time: '23:40', endTime: '00:10' },
    dayId,
    activityId
  );
  expect('activity' in result && result.activity).toMatchObject({
    time: '23:40',
    endTime: '00:10',
  });
  expect(
    'activity' in
      prepareActivity(
        context,
        { ...activityFields(activity), time: '', endTime: '' },
        dayId,
        activityId
      )
  ).toBe(true);
});
it.each(['24:00', '9:00', '12:60', '00:00:00', 'tomorrow'])(
  'rejects invalid local time %s',
  (time) => {
    expect(() =>
      prepareActivity(context, { ...activityFields(activity), time }, dayId, activityId)
    ).toThrow();
  }
);
it('validates limits, coordinates and type without losing leading-zero codes or long multiline notes', () => {
  for (const patch of [
    { title: '' },
    { title: 'x'.repeat(1001) },
    { note: 'x'.repeat(50001) },
    { confirmationCode: 'x'.repeat(1001) },
    { locationName: 'x'.repeat(301) },
    { latitude: '' },
    { longitude: '181' },
    { latitude: 'NaN' },
    { type: 'invented' },
  ]) {
    expect(() =>
      prepareActivity(context, { ...activityFields(activity), ...patch }, dayId, activityId)
    ).toThrow();
  }
  const result = prepareActivity(
    context,
    { ...activityFields(activity), note: 'n'.repeat(50000) },
    dayId,
    activityId
  );
  expect('activity' in result && result.activity.confirmationCode).toBe('00120');
});
it('preserves place translations/country for metadata edits, drops stale metadata for a changed place, and explicitly clears coordinates separately from free text', () => {
  const edit = (patch: Partial<ReturnType<typeof activityFields>>) => {
    const c = prepareActivity(
      context,
      { ...activityFields(activity), ...patch },
      dayId,
      activityId
    );
    if (!('activity' in c)) throw new Error('expected activity');
    return c.activity;
  };
  expect(edit({ note: 'New note' }).location).toEqual(activity.location);
  expect(edit({ latitude: '36' }).location).not.toHaveProperty('names');
  expect(edit({ place: 'New place' }).location).not.toHaveProperty('country_code');
  expect(edit({ place: '', address: '', latitude: '', longitude: '' })).toMatchObject({
    location: null,
    locationName: 'Platform 1',
  });
});
it('requires the original day and activity; deletion uses the target revision and does not send an editable activity body', () => {
  expect(prepareActivity(context, activityFields(activity), dayId, activityId, true)).toEqual({
    operation: 'activity.delete',
    client_request_id: expect.any(String),
    dayId,
    activityId,
    expected_activity_revision: 7,
  });
  expect(() => prepareActivity(context, activityFields(activity), 'd'.repeat(24))).toThrow();
  expect(() => prepareActivity(context, activityFields(activity), dayId, 'd'.repeat(24))).toThrow();
  expect(() =>
    prepareActivity(context, activityFields(activity), dayId, undefined, true)
  ).toThrow();
});
it('detects own revisions, deletion and day/date changes while allowing edits to other activities', () => {
  const next = structuredClone(context);
  next.days[0].revision++;
  next.days[0].activities.push({ ...activity, id: 'd'.repeat(24), revision: 99 });
  next.days[0].content = 'Unrelated day notes';
  expect(sameActivitySnapshot(context, next, dayId, activityId)).toBe(true);
  next.days[0].activities[0].revision++;
  expect(sameActivitySnapshot(context, next, dayId, activityId)).toBe(false);
  expect(sameActivitySnapshot(context, next, dayId)).toBe(true);
  next.days[0].title = 'Changed day';
  expect(sameActivitySnapshot(context, next, dayId)).toBe(false);
  expect(sameActivitySnapshot(context, { ...context, days: [] }, dayId, activityId)).toBe(false);
  expect(sameActivitySnapshot(context, { ...context, startDate: null }, dayId, activityId)).toBe(
    false
  );
});
it('restores rejected input with the fresh revision only after a new confirmation', () => {
  const command = prepareActivity(
    context,
    { ...activityFields(activity), title: 'My title', time: '23:00' },
    dayId,
    activityId
  );
  const fresh = structuredClone(context);
  fresh.days[0].activities[0].revision = 8;
  fresh.days[0].activities[0].note = 'Web note';
  const restored = restoreActivityFields(command, fresh);
  expect(restored).toMatchObject({ title: 'My title', note: activity.note, time: '23:00' });
  expect(prepareActivity(fresh, restored, dayId, activityId)).toMatchObject({
    expected_activity_revision: 8,
  });
});
it('has localized validation, missing, capacity, permission and conflict messages in all four locales', () => {
  for (const locale of ['zh', 'zh-CN', 'en', 'jp'] as const) {
    const copy = activityMessages[locale];
    for (const code of ['ACTIVITY_LIMIT', 'NOT_FOUND', 'VALIDATION_ERROR', 'FORBIDDEN', 'CONFLICT'])
      expect(activityRejection(code, copy)).not.toBe(code);
    expect(copy.add).toBeTruthy();
  }
});
