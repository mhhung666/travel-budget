import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { itineraryContinuations, type ItineraryDay } from '@travel-budget/contracts';
import type { Text } from 'react-native';
import { messages } from '@/i18n/messages';
import {
  itineraryPresentationMessages,
  continuationSource,
} from '@/i18n/itineraryPresentationMessages';
import { colors } from '@/theme/tokens';
import { ActivityContinuations } from './ActivityContinuations';
const h = vi.hoisted(() => ({
  locale: 'en' as keyof typeof messages,
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  r: 0,
  os: 'ios',
  focus: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useState: (initial: unknown) => {
    const i = h.i++;
    if (h.values[i] === undefined) h.values[i] = initial;
    return [
      h.values[i],
      (value: unknown) => {
        h.values[i] = value;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.r++] ??= { current: initial }),
  useEffect: (fn: () => void) => fn(),
}));
vi.mock('react-native', () => ({
  ...Object.fromEntries(['Modal', 'View', 'Text', 'Pressable', 'ScrollView'].map((n) => [n, n])),
  AccessibilityInfo: { sendAccessibilityEvent: h.focus },
  Platform: {
    get OS() {
      return h.os;
    },
  },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@/components/ui', () => ({
  ...Object.fromEntries(['Action', 'Copy', 'Notice'].map((n) => [n, n])),
  usePalette: () => colors.light,
}));
vi.mock('./ActivityDetails', () => ({ ActivityDetails: 'ActivityDetails' }));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => messages[h.locale],
  useAppLocale: () => h.locale,
}));
type Node = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function nodes(n: ReactNode): Node[] {
  if (Array.isArray(n)) return n.flatMap(nodes);
  if (!isValidElement(n)) return [];
  const e = n as Node;
  return [e, ...nodes(e.props.children)];
}
const activity = {
  id: 'a'.repeat(24),
  title: 'Flight',
  type: 'flight' as const,
  time: '22:25',
  endTime: '00:20',
  endDayOffset: 3,
  note: 'PRIVATE',
  confirmationCode: 'SECRET',
  location: null,
  locationName: '',
};
const days: ItineraryDay[] = [1, 2, 4].map((n) => ({
  id: String(n).repeat(24),
  dayNumber: n,
  date: `2028-03-0${n}`,
  outsideTripRange: false,
  title: `Day ${n}`,
  content: '',
  location: null,
  activities: n === 1 ? [activity] : [],
}));
const returnFocus = { current: { focus: vi.fn() } };
let currentDays = days,
  targetDayId = days[2].id;
const render = () => {
  h.i = 0;
  h.r = 0;
  return ActivityContinuations({
    days: currentDays,
    targetDayId,
    returnFocus: { current: returnFocus.current as unknown as Text },
  });
};
const find = (tree: ReactNode, key: string, value: unknown) =>
  nodes(tree).find((n) => n.props[key] === value)!;
const hint = (tree: ReactNode) => nodes(tree).find((n) => n.type === 'Pressable')!;
const open = () => {
  (hint(render()).props.onPress as () => void)();
  return render();
};
beforeEach(() => {
  h.values = [];
  h.refs = [];
  h.locale = 'en';
  h.os = 'ios';
  h.focus.mockClear();
  currentDays = structuredClone(days);
  targetDayId = days[2].id;
});
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'shows source day and arrival wording in %s and opens full original data without changing reader day',
  (locale) => {
    h.locale = locale;
    let tree = render();
    const copy = itineraryPresentationMessages[locale];
    expect(find(tree, 'children', continuationSource(locale, 1, 'Flight'))).toBeDefined();
    expect(find(tree, 'children', `00:20 · ${copy.arrival}`)).toBeDefined();
    expect(hint(tree).props.style).toMatchObject({ minHeight: 48 });
    expect(hint(tree).props.accessibilityLabel).toContain(continuationSource(locale, 1, 'Flight'));
    const sourceTrigger = { focus: vi.fn() };
    (hint(tree).props.ref as (v: unknown) => void)(sourceTrigger);
    tree = open();
    expect(find(tree, 'visible', true)).toBeDefined();
    expect(nodes(tree).find((n) => n.type === 'ActivityDetails')!.props.activity).toEqual(activity);
    (find(tree, 'testID', 'continuation-close').props.onPress as () => void)();
    tree = render();
    expect(find(tree, 'visible', false)).toBeDefined();
    (find(tree, 'visible', false).props.onDismiss as () => void)();
    expect(h.focus).toHaveBeenLastCalledWith(sourceTrigger, 'focus');
    expect(targetDayId).toBe(days[2].id);
  }
);
it('intermediate hints identify their original day and do not display the future arrival time on that day', () => {
  targetDayId = days[1].id;
  const tree = render();
  expect(find(tree, 'children', 'Continues from Day 1 · Flight')).toBeDefined();
  expect(nodes(tree).some((n) => String(n.props.children).includes('Arrival'))).toBe(false);
});
it('missing end clock is explicit and same-day/unknown/negative offsets produce no buttons', () => {
  currentDays[0].activities[0].endTime = null;
  expect(find(render(), 'children', 'Time not set · Arrival')).toBeDefined();
  for (const offset of [0, null, -1, undefined]) {
    currentDays[0].activities[0].endDayOffset = offset;
    expect(hint(render())).toBeUndefined();
  }
});
it('open source details use current data after edits and explain deletion without retaining private details', () => {
  open();
  currentDays = structuredClone(currentDays);
  currentDays[0].activities[0].title = 'Updated';
  expect(find(render(), 'children', 'Updated')).toBeDefined();
  currentDays = currentDays.filter((d) => d.dayNumber !== 1);
  const tree = render();
  expect(nodes(tree).find((n) => n.type === 'ActivityDetails')).toBeUndefined();
  expect(find(tree, 'children', itineraryPresentationMessages.en.originalGone)).toBeDefined();
  expect(find(tree, 'visible', true)).toBeDefined();
  (find(tree, 'testID', 'continuation-close').props.onPress as () => void)();
  const closed = render();
  (find(closed, 'visible', false).props.onDismiss as () => void)();
  expect(h.focus).toHaveBeenLastCalledWith(returnFocus.current, 'focus');
});
it('modal focuses its heading and supports accessibility escape / platform back', () => {
  const tree = open(),
    modal = find(tree, 'visible', true),
    heading = nodes(tree).find((n) => n.type === 'Text' && n.props.children === 'Flight')!;
  const nativeHeading = { focus: vi.fn() };
  (heading.props.ref as { current: unknown }).current = nativeHeading;
  (modal.props.onShow as () => void)();
  expect(h.focus).toHaveBeenLastCalledWith(nativeHeading, 'focus');
  (nodes(tree).find((n) => n.type === 'SafeAreaView')!.props.onAccessibilityEscape as () => void)();
  expect(find(render(), 'visible', false)).toBeDefined();
  open();
  (find(render(), 'visible', true).props.onRequestClose as () => void)();
  expect(find(render(), 'visible', false)).toBeDefined();
});
const fixtures = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../../../docs/design/fixtures/itinerary-cross-day.json', import.meta.url)
    ),
    'utf8'
  )
) as {
  name: string;
  input: { dayNumber: number; endDayOffset?: number | null; endTime: string | null };
  expected: { forwardCrossDay: boolean; endDayNumber: number | null };
}[];
it.each(fixtures)(
  'shared calendar fixture $name projects identically in the native runtime',
  ({ input, expected }) => {
    const source = input.dayNumber;
    const rows = [source, source + 1, source + 2, source + 3, source + 4].map((n) => ({
      id: String(n),
      dayNumber: n,
      activities: n === source ? [{ ...activity, ...input }] : [],
    }));
    const result = itineraryContinuations(rows);
    expect([...result].filter(([, h]) => h.length).map(([id]) => id)).toEqual(
      expected.forwardCrossDay
        ? rows
            .filter((d) => d.dayNumber > source && d.dayNumber <= expected.endDayNumber!)
            .map((d) => d.id)
        : []
    );
  }
);

it.each(['en', 'zh', 'zh-CN', 'jp'] as const)(
  'ICU keeps literal braces and markup in user titles for %s',
  (locale) => {
    const value = continuationSource(locale, 7, '{n} <b>Flight</b>');
    expect(value).toContain('7');
    expect(value).toContain('{n} <b>Flight</b>');
  }
);
