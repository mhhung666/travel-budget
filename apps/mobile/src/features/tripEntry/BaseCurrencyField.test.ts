import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import type { AppLocale } from '@/i18n/messages';
import { currencyMessages } from '@/i18n/currencyMessages';
import { BaseCurrencyField } from './BaseCurrencyField';
import { commonCurrencyCodes } from './currencySelection';
import { colors } from '@/theme/tokens';

const h = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  j: 0,
  effects: [] as (() => void)[],
  width: 390,
  fontScale: 1,
  os: 'ios',
  locale: 'en' as AppLocale,
  focus: vi.fn(),
  dismiss: vi.fn(),
  change: vi.fn(),
  openChange: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (compute: () => unknown) => compute(),
  useState: (initial: unknown) => {
    const index = h.i++;
    if (!(index in h.values)) h.values[index] = initial;
    return [h.values[index], (value: unknown) => (h.values[index] = value)];
  },
  useRef: (initial: unknown) => (h.refs[h.j++] ??= { current: initial }),
  useEffect: (effect: () => void) => h.effects.push(effect),
}));
vi.mock('react-native', () => ({
  AccessibilityInfo: { sendAccessibilityEvent: h.focus },
  Keyboard: { dismiss: h.dismiss },
  Platform: {
    get OS() {
      return h.os;
    },
  },
  useWindowDimensions: () => ({ width: h.width, fontScale: h.fontScale }),
  ...Object.fromEntries(
    ['Modal', 'Pressable', 'ScrollView', 'Text', 'View', 'KeyboardAvoidingView'].map((name) => [
      name,
      name,
    ])
  ),
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));
vi.mock('@/components/ui', () => ({
  Action: 'Action',
  Copy: 'Copy',
  Icon: 'Icon',
  TextField: 'TextField',
}));
vi.mock('@/theme/usePalette', () => ({ usePalette: () => colors.light }));
vi.mock('@/i18n/useMessages', async () => {
  const { messages } = await import('@/i18n/messages');
  return { useMessages: () => messages[h.locale], useAppLocale: () => h.locale };
});
type E = ReactElement<Record<string, unknown>>;
function nodes(node: ReactNode): E[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const e = node as E;
  return [e, ...nodes(e.props.children as ReactNode)];
}
let props: Parameters<typeof BaseCurrencyField>[0];
function render() {
  h.i = h.j = 0;
  h.effects = [];
  return nodes(BaseCurrencyField(props));
}
function find(id: string) {
  const e = render().find((n) => n.props.testID === id);
  if (!e) throw new Error(id);
  return e;
}
const press = (id: string) => (find(id).props.onPress as () => void)();
const modal = () => render().find((n) => n.type === 'Modal')!;
const search = (value: string) =>
  (find('currency-search').props.onChangeText as (v: string) => void)(value);
beforeEach(() => {
  vi.clearAllMocks();
  h.values = [];
  h.refs = [];
  h.width = 390;
  h.fontScale = 1;
  h.os = 'ios';
  h.locale = 'en';
  props = {
    value: 'USD',
    codes: [...commonCurrencyCodes, 'AED', 'ZAR'],
    disabled: false,
    open: false,
    onChange: (code) => {
      h.change(code);
      props.value = code;
    },
    onOpenChange: (open) => {
      h.openChange(open);
      props.open = open;
    },
  };
});
it.each(['zh', 'zh-CN', 'en', 'jp'] as AppLocale[])(
  'searches complete names in %s without auto-focusing or changing selected currency',
  (locale) => {
    h.locale = locale;
    press('trip-base-currency');
    expect(modal().props.visible).toBe(true);
    expect(find('currency-search').props).toMatchObject({
      autoFocus: false,
      autoCapitalize: 'none',
      returnKeyType: 'search',
    });
    expect(find('currency-search').props.maxLength).toBeUndefined();
    expect(
      render().filter((n) => String(n.props.testID).startsWith('currency-option-'))
    ).toHaveLength(17);
    search(currencyMessages[locale].names.JPY);
    expect(find('currency-option-JPY').props.accessibilityState).toEqual({ selected: false });
    expect(h.change).not.toHaveBeenCalled();
    (find('currency-search').props.onSubmitEditing as () => void)();
    expect(h.change).not.toHaveBeenCalled();
    expect(props.open).toBe(true);
    expect(find('currency-results').props.keyboardShouldPersistTaps).toBe('handled');
    press('currency-option-JPY');
    expect(h.change).toHaveBeenCalledExactlyOnceWith('JPY');
    expect(props.open).toBe(false);
  }
);
it('clears, cancels and reopens without changing the value; every exit closes only this panel', () => {
  for (const exit of [
    () => press('currency-cancel'),
    () => (modal().props.onRequestClose as () => void)(),
    () =>
      (
        render().find((n) => n.type === 'SafeAreaView')!.props.onAccessibilityEscape as () => void
      )(),
  ]) {
    press('trip-base-currency');
    search('not-a-currency');
    expect(render().some((n) => n.props.children === currencyMessages.en.noMatch)).toBe(true);
    press('currency-clear');
    expect(find('currency-search').props.value).toBe('');
    exit();
    expect(props.value).toBe('USD');
    expect(props.open).toBe(false);
    search('old search');
    press('trip-base-currency');
    expect(find('currency-search').props.value).toBe('');
    exit();
  }
  expect(h.change).not.toHaveBeenCalled();
  press('trip-base-currency');
  press('currency-option-USD');
  expect(props.value).toBe('USD');
  expect(props.open).toBe(false);
});
it('locates the selected row and restores accessibility focus after dismissal', () => {
  const scrollTo = vi.fn();
  render();
  h.refs[0].current = { focus: vi.fn() };
  h.refs[1].current = {};
  h.refs[2].current = { scrollTo };
  press('trip-base-currency');
  (find('currency-option-USD').props.onLayout as (e: unknown) => void)({
    nativeEvent: { layout: { y: 240 } },
  });
  (modal().props.onShow as () => void)();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 240, animated: false });
  expect(h.focus).toHaveBeenCalledWith(h.refs[1].current, 'focus');
  search('JPY');
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  press('currency-cancel');
  (modal().props.onDismiss as () => void)();
  expect(h.focus).toHaveBeenLastCalledWith(h.refs[0].current, 'focus');
});
it('is readonly for one current candidate, but lets an invalid selection be explicitly replaced', () => {
  props.codes = ['TWD'];
  props.value = 'TWD';
  expect(find('trip-base-currency').props).toMatchObject({
    disabled: true,
    accessibilityRole: 'text',
  });
  press('trip-base-currency');
  expect(props.open).toBe(false);
  props.value = 'USD';
  press('trip-base-currency');
  expect(modal().props.visible).toBe(true);
  press('currency-option-TWD');
  expect(props.value).toBe('TWD');
  props.codes = [];
  expect(find('trip-base-currency').props.disabled).toBe(true);
});
it('keeps results isolated from the background form and closes when disabled', () => {
  press('trip-base-currency');
  render();
  for (const effect of h.effects) effect();
  props.disabled = true;
  expect(modal().props.visible).toBe(false);
  for (const effect of h.effects) effect();
  expect(props.open).toBe(false);
  press('currency-option-JPY');
  expect(h.change).not.toHaveBeenCalled();
  expect(render().find((n) => n.type === 'SafeAreaView')!.props).toMatchObject({
    accessibilityViewIsModal: true,
    edges: ['top', 'bottom', 'left', 'right'],
  });
});
it('limits iPad width and allows large type a full-width panel without fixed row height', () => {
  h.width = 1024;
  expect(find('currency-panel').props.style).toMatchObject({ maxWidth: 600, maxHeight: '90%' });
  h.fontScale = 2;
  expect(find('currency-panel').props.style).toMatchObject({
    maxWidth: undefined,
    maxHeight: undefined,
  });
  const style = find('currency-option-USD').props.style as (s: {
    pressed: boolean;
  }) => Record<string, unknown>;
  expect(style({ pressed: false })).toMatchObject({ minHeight: 48 });
  expect(style({ pressed: false }).height).toBeUndefined();
  const fieldStyle = find('trip-base-currency').props.style as (s: {
    pressed: boolean;
  }) => Record<string, unknown>;
  expect(fieldStyle({ pressed: false }).minHeight).toBe(52);
});
