import { expect, it } from 'vitest';
import type { ItineraryEditContext } from '@travel-budget/contracts';
import { dayFields, prepareDay, restoreDayFields, sameDaySnapshot } from './dayForm';
import { dayRejection, itineraryMessages } from '@/i18n/itineraryMessages';
const id = (n: number) => n.toString(16).padStart(24, '0');
export const fixture: ItineraryEditContext = {
  tripId: id(1),
  startDate: '2026-11-03',
  endDate: '2026-11-10',
  days: [
    {
      id: id(2),
      dayNumber: 1,
      date: '2026-11-03',
      title: '京都',
      content: '# 說明\n'.repeat(1000),
      location: {
        name: '京都',
        names: { en: 'Kyoto', jp: '京都' },
        display_name: '日本 京都',
        lat: 35.01,
        lon: 135.76,
      },
      outsideTripRange: false,
      revision: 3,
      deleteImpact: {
        activityCount: 2,
        attachmentCount: 3,
        expenseCount: 4,
        photoCount: 5,
        revision: 'a'.repeat(64),
      },
      activities: [],
    },
    {
      id: id(3),
      dayNumber: 5,
      date: '2026-11-07',
      title: '大阪',
      content: '',
      location: null,
      outsideTripRange: false,
      revision: 1,
      deleteImpact: {
        activityCount: 0,
        attachmentCount: 0,
        expenseCount: 0,
        photoCount: 0,
        revision: 'b'.repeat(64),
      },
      activities: [],
    },
  ],
};
it('suggests an unoccupied day without renumbering existing gaps, with date-only arithmetic', () => {
  expect(dayFields(fixture)).toMatchObject({ date: '2026-11-04', dayNumber: '2' });
  expect(dayFields({ ...fixture, startDate: null, endDate: null })).toMatchObject({
    date: '',
    dayNumber: '2',
  });
});
it('metadata updates preserve multilingual location data and do not send activities or attachments', () => {
  const day = fixture.days[0];
  const command = prepareDay(fixture, { ...dayFields(fixture, day), title: '新名稱' }, day);
  expect(command).toMatchObject({
    operation: 'day.update',
    dayId: day.id,
    expected_revision: 3,
    location: day.location,
    content: day.content,
  });
  expect(command).not.toHaveProperty('activities');
  expect(command).not.toHaveProperty('target');
});
it('moving a day freezes dates, keeps old title/content and validates collisions and bounds', () => {
  const day = fixture.days[0],
    fields = dayFields(fixture, day);
  expect(prepareDay(fixture, { ...fields, date: '2026-11-04' }, day)).toMatchObject({
    target: {
      date: '2026-11-04',
      expected_start_date: '2026-11-03',
      expected_end_date: '2026-11-10',
    },
  });
  expect(() => prepareDay(fixture, { ...fields, date: '2026-11-07' }, day)).toThrow(
    'DAY_ALREADY_EXISTS'
  );
  expect(() => prepareDay(fixture, { ...fields, date: '2026-11-02' }, day)).toThrow(
    'DATE_OUTSIDE_TRIP'
  );
  expect(() => prepareDay(fixture, { ...fields, date: '2026-11-11' }, day)).toThrow(
    'DATE_OUTSIDE_TRIP'
  );
});
it.each(['2026-02-30', '2026-13-01', '11/03/2026', '', '2026-1-03'])(
  'rejects invalid date %s',
  (date) => {
    expect(() => prepareDay(fixture, { ...dayFields(fixture), title: 'New', date })).toThrow();
  }
);
it.each(['0', '-1', '1.5', '1e2', '3651', ''])('rejects invalid numbered day %s', (dayNumber) => {
  const c = { ...fixture, startDate: null, endDate: null };
  expect(() => prepareDay(c, { ...dayFields(c), title: 'New', dayNumber })).toThrow();
});
it('supports an undated trip and explicit location removal, but rejects incomplete/nonfinite coordinates', () => {
  const c = { ...fixture, startDate: null, endDate: null };
  expect(prepareDay(c, { ...dayFields(c), title: 'New' })).toMatchObject({
    target: { day_number: 2, expected_start_date: null },
  });
  const day = fixture.days[0],
    fields = dayFields(fixture, day);
  expect(
    prepareDay(fixture, { ...fields, place: '', address: '', latitude: '', longitude: '' }, day)
  ).toHaveProperty('location', null);
  for (const latitude of ['', 'NaN', '91', 'Infinity'])
    expect(() => prepareDay(fixture, { ...fields, latitude }, day)).toThrow();
});
it('rejects blank titles and overlength content, retaining legal long content exactly', () => {
  const fields = dayFields(fixture);
  expect(() => prepareDay(fixture, { ...fields, title: '  ' })).toThrow();
  expect(() =>
    prepareDay(fixture, { ...fields, title: 'a', content: 'b'.repeat(50001) })
  ).toThrow();
  expect(prepareDay(fixture, { ...fields, title: 'a', content: 'b'.repeat(50000) })).toHaveProperty(
    'content',
    'b'.repeat(50000)
  );
});
it('delete uses the exact day and association revisions, never a list index', () => {
  const day = fixture.days[1];
  expect(prepareDay(fixture, dayFields(fixture, day), day, true)).toMatchObject({
    operation: 'day.delete',
    dayId: day.id,
    expected_revision: 1,
    expected_impact_revision: day.deleteImpact.revision,
  });
  expect(() => prepareDay(fixture, dayFields(fixture), undefined, true)).toThrow('NOT_FOUND');
});
it('detects dates, day deletion, metadata revision and deletion-impact changes', () => {
  const day = fixture.days[0];
  expect(sameDaySnapshot(fixture, structuredClone(fixture), day.id)).toBe(true);
  expect(sameDaySnapshot(fixture, { ...fixture, startDate: '2026-11-04' }, day.id)).toBe(false);
  expect(sameDaySnapshot(fixture, { ...fixture, days: [] }, day.id)).toBe(false);
  for (const change of [
    { revision: 4 },
    { deleteImpact: { ...day.deleteImpact, revision: 'c'.repeat(64) } },
  ])
    expect(
      sameDaySnapshot(fixture, { ...fixture, days: [{ ...day, ...change }] }, day.id, true)
    ).toBe(false);
});
it('reference-only changes do not conflict with a metadata edit, but do invalidate deletion confirmation', () => {
  const next = structuredClone(fixture);
  next.days[0].deleteImpact.revision = 'f'.repeat(64);
  expect(sameDaySnapshot(fixture, next, fixture.days[0].id)).toBe(true);
  expect(sameDaySnapshot(fixture, next, fixture.days[0].id, true)).toBe(false);
});
it('rejected input can be restored against latest context without erasing typed text or dates', () => {
  const command = prepareDay(fixture, {
    ...dayFields(fixture),
    title: '我的修改',
    date: '2026-11-06',
  });
  const restored = restoreDayFields({ ...fixture, startDate: '2026-11-04' }, command);
  expect(restored).toMatchObject({ title: '我的修改', date: '2026-11-06' });
});
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'provides %s labels and localized terminal rejections without raw API codes',
  (locale) => {
    const copy = itineraryMessages[locale];
    expect(Object.keys(copy).sort()).toEqual(Object.keys(itineraryMessages.en).sort());
    for (const code of [
      'NOT_FOUND',
      'CONFLICT',
      'VALIDATION_ERROR',
      'FORBIDDEN',
      'TRIP_DATES_CHANGED',
      'DAY_ALREADY_EXISTS',
      'DATE_OUTSIDE_TRIP',
      'DELETE_IMPACT_CHANGED',
    ])
      expect(dayRejection(code, copy)).not.toBe(code);
  }
);
