import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { NavigationMenu } from './NavigationMenu';
import { useNavigationFit } from './navigationFit';
import { colors } from '@/theme/tokens';

const h = vi.hoisted(() => ({
  width: 390,
  fontScale: 1,
  platform: 'ios',
  state: [] as unknown[],
  refs: [] as { current: unknown }[],
  deps: [] as unknown[][],
  i: 0,
  j: 0,
  k: 0,
  focus: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.i++;
    if (!(i in h.state)) h.state[i] = initial;
    return [
      h.state[i],
      (value: unknown) => {
        h.state[i] = value;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.j++] ??= { current: initial }),
  useEffect: (effect: () => void, deps: unknown[]) => {
    const i = h.k++;
    if (!h.deps[i] || deps.some((value, index) => !Object.is(value, h.deps[i][index]))) effect();
    h.deps[i] = deps;
  },
}));
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Modal: 'Modal',
  AccessibilityInfo: { sendAccessibilityEvent: h.focus },
  Platform: {
    get OS() {
      return h.platform;
    },
  },
  useWindowDimensions: () => ({ width: h.width, height: 844, fontScale: h.fontScale }),
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@/theme/usePalette', () => ({ usePalette: () => colors.light }));
vi.mock('./icons', () => ({ Icon: 'Icon' }));

function render<T>(component: () => T) {
  h.i = h.j = h.k = 0;
  return component();
}
type Element = ReactElement<Record<string, unknown>>;
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...nodes(element.props.children as ReactNode)];
}
function find(node: ReactNode, prop: string, value: unknown) {
  const element = nodes(node).find((e) => e.props[prop] === value);
  if (!element) throw new Error(`Missing ${prop}=${String(value)}`);
  return element;
}
beforeEach(() => {
  h.width = 390;
  h.fontScale = 1;
  h.platform = 'ios';
  h.state = [];
  h.refs = [];
  h.deps = [];
  h.focus.mockReset();
});
it('uses measured space and resets overflow when width, font scale or translations change', () => {
  let labels = 'Overview:Expenses:Settlement';
  const fit = () => render(() => useNavigationFit(labels));
  expect(fit().compact).toBe(false);
  fit().onTextLayout({ nativeEvent: { lines: [{}, {}] } } as never);
  expect(fit().compact).toBe(true);
  h.width = 768;
  expect(fit().compact).toBe(false);
  fit().onLayout({ nativeEvent: { layout: { width: 280 } } } as never);
  expect(fit().compact).toBe(true);
  fit().onLayout({ nativeEvent: { layout: { width: 640 } } } as never);
  expect(fit().compact).toBe(false);
  fit().onTextLayout({ nativeEvent: { lines: [{}, {}] } } as never);
  labels = '概覽:支出:結算';
  expect(fit().compact).toBe(false);
  h.fontScale = 1.5;
  expect(fit().compact).toBe(true);
  h.fontScale = 3;
  expect(fit().compact).toBe(true);
  h.fontScale = 1;
  expect(fit().compact).toBe(false);
});
it('keeps every choice, selection and full context in a scrollable modal and restores iOS focus', () => {
  const select = vi.fn();
  const menu = () =>
    render(() =>
      NavigationMenu({
        title: 'Trip pages',
        label: 'Expenses',
        closeLabel: 'Close menu',
        testID: 'menu',
        context: 'A very long complete trip name',
        choices: [
          { label: 'Overview', testID: 'overview', onPress: select },
          { label: 'Expenses', selected: true, testID: 'expenses', onPress: select },
          { label: 'Settlement', testID: 'settlement', onPress: select },
        ],
      })
    );
  let tree = menu();
  const trigger = { focus: vi.fn() },
    heading = { focus: vi.fn() };
  (find(tree, 'testID', 'menu').props.ref as { current: unknown }).current = trigger;
  (find(tree, 'accessibilityRole', 'header').props.ref as { current: unknown }).current = heading;
  expect(find(tree, 'testID', 'menu').props.accessibilityLabel).toBe('Trip pages: Expenses');
  (find(tree, 'testID', 'menu').props.onPress as () => void)();
  tree = menu();
  expect(find(tree, 'testID', 'menu').props.accessibilityState).toEqual({ expanded: true });
  const modal = nodes(tree).find((e) => e.type === 'Modal')!;
  expect(modal.props.visible).toBe(true);
  (modal.props.onShow as () => void)();
  expect(h.focus).toHaveBeenCalledWith(heading, 'focus');
  expect(find(tree, 'testID', 'expenses').props.accessibilityState).toEqual({ selected: true });
  const scroll = nodes(tree).find((e) => e.type === 'ScrollView')!;
  expect(find(scroll, 'children', 'A very long complete trip name')).toBeDefined();
  (find(tree, 'testID', 'settlement').props.onPress as () => void)();
  expect(select).not.toHaveBeenCalled();
  expect(nodes(menu()).find((e) => e.type === 'Modal')!.props.visible).toBe(false);
  (modal.props.onDismiss as () => void)();
  expect(h.focus).toHaveBeenLastCalledWith(trigger, 'focus');
  expect(select).toHaveBeenCalledOnce();
  (modal.props.onDismiss as () => void)();
  expect(select).toHaveBeenCalledOnce();
});
it.each(['onRequestClose', 'onAccessibilityEscape', 'close-button'])(
  'supports %s without navigating',
  (event) => {
    const select = vi.fn();
    const menu = () =>
      render(() =>
        NavigationMenu({
          title: 'Navigation',
          label: 'Trips',
          closeLabel: 'Close',
          testID: 'menu',
          choices: [{ label: 'Trips', testID: 'trips', onPress: select }],
        })
      );
    let tree = menu();
    (find(tree, 'testID', 'menu').props.onPress as () => void)();
    tree = menu();
    const handler =
      event === 'close-button'
        ? find(tree, 'testID', 'menu-close').props.onPress
        : nodes(tree).find((e) => e.props[event])!.props[event];
    (handler as () => void)();
    expect(nodes(menu()).find((e) => e.type === 'Modal')!.props.visible).toBe(false);
    expect(select).not.toHaveBeenCalled();
  }
);
it.each(['android', 'web'])(
  'restores %s trigger focus without depending on iOS onDismiss',
  (platform) => {
    h.platform = platform;
    const menu = () =>
      render(() =>
        NavigationMenu({
          title: 'Navigation',
          label: 'Trips',
          closeLabel: 'Close',
          testID: 'menu',
          choices: [],
        })
      );
    let tree = menu();
    const trigger = { focus: vi.fn() };
    (find(tree, 'testID', 'menu').props.ref as { current: unknown }).current = trigger;
    (find(tree, 'testID', 'menu').props.onPress as () => void)();
    tree = menu();
    (find(tree, 'testID', 'menu-close').props.onPress as () => void)();
    menu();
    if (platform === 'web') expect(trigger.focus).toHaveBeenCalledOnce();
    else expect(h.focus).toHaveBeenCalledWith(trigger, 'focus');
  }
);
