import { beforeEach, expect, it, vi } from 'vitest';
import { Text } from './Text';

const h = vi.hoisted(() => ({ fontScale: 1, os: 'ios' }));
vi.mock('react-native', () => ({
  Text: 'NativeText',
  Platform: {
    get OS() {
      return h.os;
    },
  },
  useWindowDimensions: () => ({ fontScale: h.fontScale }),
}));
beforeEach(() => {
  h.fontScale = 1;
  h.os = 'ios';
});

it.each([
  '調整行程 · 2028年2月29日',
  '调整行程 · 2028年2月29日',
  'Itinerary · February 29, 2028',
  '日程 · 2028年2月29日',
])(
  'invalidates the native paragraph in both directions without limiting scaling: %s',
  (children) => {
    const ref = { current: null };
    const onTextLayout = vi.fn();
    const style = { fontSize: 16, lineHeight: 24 };
    const props = {
      children,
      ref,
      style,
      selectable: true,
      accessibilityRole: 'header' as const,
      onTextLayout,
    };
    const initial = Text(props);
    h.fontScale = 3.1;
    const enlarged = Text(props);
    expect(enlarged.key).not.toBe(initial.key);
    expect(Text(props).key).toBe(enlarged.key);
    expect(enlarged.type).toBe('NativeText');
    expect(enlarged.props).toEqual(initial.props);
    expect(enlarged.props.ref).toBe(ref);
    expect(enlarged.props.style).toBe(style);
    expect(enlarged.props.onTextLayout).toBe(onTextLayout);
    expect(enlarged.props.allowFontScaling).toBeUndefined();
    expect(enlarged.props.maxFontSizeMultiplier).toBeUndefined();
    expect(enlarged.props.numberOfLines).toBeUndefined();
    h.fontScale = 1;
    expect(Text(props).key).toBe(initial.key);
  }
);

it.each(['android', 'web'])('keeps the existing native text identity on %s', (os) => {
  h.os = os;
  const first = Text({ children: 'Day 3' });
  h.fontScale = 3.1;
  expect(Text({ children: 'Day 3' }).key).toBe(first.key);
});
