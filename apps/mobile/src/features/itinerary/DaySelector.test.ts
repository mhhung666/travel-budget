import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import type { ItineraryDay } from '@travel-budget/contracts';
import { messages } from '@/i18n/messages';
import { colors } from '@/theme/tokens';
import { DaySelector } from './DaySelector';
const h = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  i: 0,
  locale: 'en' as keyof typeof messages,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useRef: (value: unknown) => (h.refs[h.i++] ??= { current: value }),
  useEffect: (effect: () => void) => effect(),
}));
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Text: 'Text',
  View: 'View',
}));
vi.mock('@/components/NavigationMenu', () => ({ NavigationMenu: 'NavigationMenu' }));
vi.mock('@/components/ui', () => ({ usePalette: () => colors.light }));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => messages[h.locale],
  useAppLocale: () => h.locale,
}));
vi.mock('@/i18n/useDisplayFormat', () => ({
  useDisplayFormat: () => ({ date: (v: string) => v }),
}));
type Node = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function nodes(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const n = node as Node;
  return [n, ...nodes(n.props.children)];
}
const days: ItineraryDay[] = [2, 5, 3650].map((n) => ({
  id: String(n).padStart(24, '0'),
  dayNumber: n,
  date: n === 2 ? '2028-02-29' : null,
  title: 'Long complete title '.repeat(20),
  content: '',
  location: null,
  activities: [],
  outsideTripRange: false,
}));
beforeEach(() => {
  h.refs = [];
  h.i = 0;
  h.locale = 'en';
});
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'shows all actual days with full accessible labels and a complete picker in %s',
  (locale) => {
    h.locale = locale;
    const select = vi.fn();
    const tree = DaySelector({ days, selectedId: days[1].id, select });
    const chips = nodes(tree).filter((n) => n.type === 'Pressable');
    expect(chips).toHaveLength(3);
    expect(chips.map((n) => n.props.accessibilityState)).toEqual([
      { selected: false },
      { selected: true },
      { selected: false },
    ]);
    for (const chip of chips) {
      expect(chip.props.accessibilityLabel).toContain(days[0].title);
      expect(chip.props.numberOfLines).toBeUndefined();
      expect(chip.props.style).toMatchObject({ minHeight: 48 });
    }
    (chips[2].props.onPress as () => void)();
    expect(select).toHaveBeenCalledWith(days[2].id);
    const picker = nodes(tree).find((n) => n.props.testID === 'itinerary-day-picker')!;
    const choices = picker.props.choices as { selected: boolean; onPress: () => void }[];
    expect(choices.map((c) => c.selected)).toEqual([false, true, false]);
    choices[0].onPress();
    expect(select).toHaveBeenLastCalledWith(days[0].id);
  }
);
it('reveals the measured selected chip after content layout and a picker jump', () => {
  let selectedId = days[2].id;
  const render = () => {
    h.i = 0;
    return DaySelector({ days, selectedId, select: vi.fn() });
  };
  let tree = render();
  const scrollTo = vi.fn();
  const scroll = nodes(tree).find((n) => n.type === 'ScrollView')!;
  (scroll.props.ref as { current: unknown }).current = { scrollTo };
  for (const [i, chip] of nodes(tree)
    .filter((n) => n.type === 'Pressable')
    .entries())
    (chip.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { x: i * 240 } } });
  (scroll.props.onContentSizeChange as () => void)();
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 472, animated: false });
  selectedId = days[1].id;
  tree = render();
  expect(nodes(tree).find((n) => n.type === 'ScrollView')!.props.horizontal).toBe(true);
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 232, animated: false });
});
