import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { itineraryContinuations, type ItineraryContinuationSource } from '@travel-budget/contracts';
import { ActivityContinuations } from '@/components/trips/detail/itinerary/ActivityContinuations';
import { activityAnchorId, projectItineraryContinuations } from '@/lib/itineraryContinuations';
import type { ItineraryDay } from '@/types';
import { projectMobileItinerary } from '@/lib/itineraryProjection';
import en from '@/i18n/messages/en.json';
import zh from '@/i18n/messages/zh.json';
import cn from '@/i18n/messages/zh-CN.json';
import jp from '@/i18n/messages/jp.json';
const h = vi.hoisted(() => ({
  locale: 'en',
  batch: null as null | { dayId?: string; canLeaveDay: ReturnType<typeof vi.fn> },
}));
const catalogs = { en, zh, 'zh-CN': cn, jp };
vi.mock('next-intl', async (original) => {
  const actual = await original<typeof import('next-intl')>();
  return {
    useTranslations: (namespace: 'itinerary.continuation') =>
      actual.createTranslator({
        locale: h.locale,
        messages: catalogs[h.locale as keyof typeof catalogs],
        namespace,
      }),
  };
});
vi.mock('@/components/trips/detail/itinerary/ActivityBatchDeletion', () => ({
  useActivityBatchSelection: () => h.batch,
}));
afterEach(() => {
  cleanup();
  h.batch = null;
  h.locale = 'en';
  vi.restoreAllMocks();
});
const activity = { id: 'a', title: 'Flight', type: 'flight', endDayOffset: 3, endTime: '00:20' };
const days: ItineraryContinuationSource[] = [1, 2, 4, 6].map((n) => ({
  id: `d${n}`,
  dayNumber: n,
  activities: n === 1 ? [activity] : [],
}));
const fixtures = JSON.parse(
  readFileSync('../../docs/design/fixtures/itinerary-cross-day.json', 'utf8')
) as {
  name: string;
  input: { dayNumber: number; endDayOffset?: number | null; endTime: string | null };
  expected: { forwardCrossDay: boolean; endDayNumber: number | null };
}[];
it.each(fixtures)(
  'shared fixture $name only projects explicit forward calendar days',
  ({ input, expected }) => {
    const source = input.dayNumber;
    const rows = [source, source + 1, source + 2, source + 3, source + 4].map((n) => ({
      id: `d${n}`,
      dayNumber: n,
      activities: n === source ? [{ ...activity, ...input }] : [],
    }));
    const projected = itineraryContinuations(rows);
    const present = Array.from(projected.entries()).filter(([, hints]) => hints.length);
    expect(present.map(([id]) => id)).toEqual(
      expected.forwardCrossDay
        ? rows
            .filter((d) => d.dayNumber > source && d.dayNumber <= expected.endDayNumber!)
            .map((d) => d.id)
        : []
    );
    for (const [id, [hint]] of present)
      expect(hint.isEndDay).toBe(id === `d${expected.endDayNumber}`);
  }
);
it('keeps gaps, intermediate hints, missing clocks and output privacy without mutating source rows', () => {
  const input = structuredClone(days);
  Object.assign(input[0].activities[0], { confirmationCode: 'SECRET', attachments: ['PRIVATE'] });
  const before = JSON.stringify(input),
    result = itineraryContinuations(input);
  expect([...result.keys()]).toEqual(['d1', 'd2', 'd4', 'd6']);
  expect(result.get('d2')![0].isEndDay).toBe(false);
  expect(result.get('d4')![0].isEndDay).toBe(true);
  expect(JSON.stringify([...result])).not.toMatch(/SECRET|PRIVATE|confirmationCode|attachments/);
  expect(JSON.stringify(input)).toBe(before);
  expect(
    itineraryContinuations([
      { ...days[0], activities: [{ ...activity, endTime: null }] },
      days[2],
    ]).get('d4')![0].endTime
  ).toBeNull();
});
it('sorts known end clocks first and ties by source day and original activity order', () => {
  const input = [
    { id: 'd2', dayNumber: 2, activities: [{ ...activity, id: 'later-source', endDayOffset: 2 }] },
    {
      ...days[0],
      activities: [
        { ...activity, id: 'unknown', endTime: null },
        { ...activity, id: 'tie-a' },
        { ...activity, id: 'tie-b' },
        { ...activity, id: 'first', endTime: '00:10' },
      ],
    },
    days[2],
  ];
  expect(
    itineraryContinuations(input)
      .get('d4')!
      .map((h) => h.activityId)
  ).toEqual(['first', 'tie-a', 'tie-b', 'later-source', 'unknown']);
});
it('recomputes after source/target deletion and offset changes; does not store projected copies', () => {
  expect(itineraryContinuations(days.slice(1)).get('d4')).toEqual([]);
  expect(itineraryContinuations(days.filter((d) => d.id !== 'd4')).get('d4')).toBeUndefined();
  expect(days[0].activities).toHaveLength(1);
  expect(
    itineraryContinuations([
      { ...days[0], activities: [{ ...activity, endDayOffset: 1 }] },
      ...days.slice(1),
    ]).get('d4')
  ).toEqual([]);
});
it.each(['en', 'zh', 'zh-CN', 'jp'] as const)(
  'renders %s end/intermediate wording and focuses the single original row',
  (locale) => {
    h.locale = locale;
    const hints = itineraryContinuations(days).get('d4')!;
    const scroll = vi.fn();
    render(
      <>
        <ActivityContinuations hints={hints} />
        <div id={activityAnchorId('d1', 'a')} tabIndex={-1}>
          original
        </div>
      </>
    );
    const row = document.getElementById(activityAnchorId('d1', 'a'))!;
    row.scrollIntoView = scroll;
    fireEvent.click(screen.getByRole('button'));
    expect(document.activeElement).toBe(row);
    expect(scroll).toHaveBeenCalledOnce();
    expect(screen.getByText(`00:20 · ${catalogs[locale].itinerary.timing.arrival}`)).toBeDefined();
  }
);
it('hides hints throughout multi-select and checks the existing leave guard before source navigation', () => {
  const hints = itineraryContinuations(days).get('d4')!;
  h.batch = { dayId: 'd6', canLeaveDay: vi.fn(() => false) };
  const { rerender } = render(<ActivityContinuations hints={hints} />);
  expect(screen.queryByRole('button')).toBeNull();
  h.batch = { canLeaveDay: vi.fn(() => false) };
  rerender(<ActivityContinuations hints={hints} />);
  fireEvent.click(screen.getByRole('button'));
  expect(h.batch.canLeaveDay).toHaveBeenCalledWith('d1');
  expect(screen.queryByRole('status')).toBeNull();
});
it('explains a missing source instead of navigating elsewhere; missing end clock never becomes midnight', () => {
  const hints = itineraryContinuations([
    { ...days[0], activities: [{ ...activity, endTime: null }] },
    days[2],
  ]).get('d4')!;
  const { rerender } = render(<ActivityContinuations hints={hints} />);
  expect(screen.getByText(`Time not set · Arrival`)).toBeDefined();
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('status').textContent).toBe(en.itinerary.continuation.gone);
  rerender(<ActivityContinuations hints={itineraryContinuations(days).get('d2')!} />);
  expect(screen.queryByText(/Arrival/)).toBeNull();
});
it('Web adapter passes only whitelisted public fields to the shared projection', () => {
  const web: ItineraryDay[] = days.map((d) => ({
    id: d.id,
    revision: 1,
    trip_id: 'trip',
    day_number: d.dayNumber,
    title: 'Day',
    content: '',
    location: null,
    created_at: '',
    updated_at: '',
    activities: d.activities.map((a) => ({
      id: a.id,
      title: a.title,
      type: 'flight',
      revision: 1,
      time: '22:25',
      location: null,
      note: '',
      end_day_offset: a.endDayOffset,
      end_time: a.endTime,
      confirmation_code: 'SECRET',
      attachments: [{ key: 'PRIVATE', content_type: 'image/jpeg', size: 1 }],
    })),
  }));
  expect(projectItineraryContinuations(web)).toEqual(itineraryContinuations(days));
});

it('matches native API order for tied end clocks and missing clocks, preserving source rows', () => {
  const id = (n: number) => n.toString(16).padStart(24, '0');
  const base = {
    revision: 0,
    type: 'flight' as const,
    end_time: '00:20',
    end_day_offset: 1,
    location: null,
    location_name: '',
    note: '',
    confirmation_code: '',
    attachments: [],
  };
  const web: ItineraryDay[] = [1, 2].map((n) => ({
    id: id(n),
    trip_id: id(9),
    revision: 0,
    day_number: n,
    title: 'Day',
    content: '',
    location: null,
    created_at: '',
    updated_at: '',
    activities:
      n === 1
        ? [
            { ...base, id: id(3), title: 'Late', time: '22:00' },
            { ...base, id: id(4), title: 'Early', time: '20:00' },
            { ...base, id: id(5), title: 'No clock late', time: '23:00', end_time: null },
            { ...base, id: id(6), title: 'No clock early', time: '19:00', end_time: null },
          ]
        : [],
  }));
  const before = JSON.stringify(web);
  const native = projectMobileItinerary(id(9), {}, web);
  const projected = projectItineraryContinuations(web);
  expect(projected).toEqual(itineraryContinuations(native.days));
  expect(projected.get(id(2))!.map((h) => h.title)).toEqual([
    'Early',
    'Late',
    'No clock early',
    'No clock late',
  ]);
  expect(JSON.stringify(web)).toBe(before);
});
