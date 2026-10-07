import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Action, Badge, Card, Chip, Notice, Page, TextField } from './ui';
import { Icon } from './icons';
import { colors, sizing } from '@/theme/tokens';

const h = vi.hoisted(() => ({
  scheme: 'light',
  platform: 'ios',
  state: [] as unknown[],
  deps: [] as unknown[][],
  stateIndex: 0,
  effectIndex: 0,
  announce: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.stateIndex++;
    if (!(i in h.state)) h.state[i] = initial;
    return [
      h.state[i],
      (value: unknown) => {
        h.state[i] = value;
      },
    ];
  },
  useEffect: (effect: () => void, deps: unknown[]) => {
    const i = h.effectIndex++;
    if (!h.deps[i] || deps.some((dep, index) => !Object.is(dep, h.deps[i][index]))) effect();
    h.deps[i] = deps;
  },
}));
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  AccessibilityInfo: { announceForAccessibilityWithOptions: h.announce },
  useColorScheme: () => h.scheme,
  Platform: {
    get OS() {
      return h.platform;
    },
    select: (options: Record<string, unknown>) => options.android,
  },
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));

type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function render(component: () => ReactElement) {
  h.stateIndex = h.effectIndex = 0;
  return component() as Element;
}
function find(node: ReactNode, type: unknown): Element {
  if (isValidElement(node)) {
    const element = node as Element;
    if (element.type === type) return element;
    return find(element.props.children, type);
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      try {
        return find(child, type);
      } catch {
        /* Try the next sibling. */
      }
    }
  }
  throw new Error(`Missing ${String(type)}`);
}
function content(element: Element, pressed = false): ReactNode {
  return typeof element.props.children === 'function'
    ? (element.props.children as (state: { pressed: boolean }) => ReactNode)({ pressed })
    : element.props.children;
}
function style(element: Element, pressed = false): Record<string, unknown> {
  const value =
    typeof element.props.style === 'function'
      ? element.props.style({ pressed })
      : element.props.style;
  return Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
}
function press(element: Element) {
  (element.props.onPress as () => void)();
}
beforeEach(() => {
  h.scheme = 'light';
  h.platform = 'ios';
  h.state = [];
  h.deps = [];
  h.stateIndex = h.effectIndex = 0;
  h.announce.mockReset();
});

describe('Action', () => {
  it.each([{ disabled: true }, { busy: true }, { disabled: true, busy: true }])(
    'blocks callbacks and exposes state for %o',
    (flags) => {
      const onPress = vi.fn();
      const element = render(() =>
        Action({ label: '確認送出', testID: 'confirm', onPress, ...flags })
      );
      press(element);
      expect(onPress).not.toHaveBeenCalled();
      expect(element.props).toMatchObject({
        testID: 'confirm',
        accessibilityLabel: '確認送出',
        accessibilityState: { disabled: true, busy: !!flags.busy },
      });
      expect(style(element)).toMatchObject({ backgroundColor: colors.light.disabled });
      expect(style(find(content(element), 'Text')).color).toBe(colors.light.onDisabled);
      if (flags.busy) expect(find(content(element), Icon).props.name).toBe('spinner');
    }
  );
  it('keeps the old secondary prop and gives explicit variant precedence', () => {
    const onPress = vi.fn();
    const secondary = render(() => Action({ label: '返回修改', secondary: true, onPress }));
    expect(style(secondary).backgroundColor).toBe(colors.light.surface);
    const danger = render(() =>
      Action({ label: '刪除', secondary: true, variant: 'danger', icon: 'alert', onPress })
    );
    expect(style(danger).backgroundColor).toBe(colors.light.dangerFill);
    expect(style(find(content(danger, true), 'Text')).color).toBe(colors.light.danger);
    expect(find(content(danger, true), Icon).props.color).toBe(colors.light.danger);
    press(danger);
    expect(onPress).toHaveBeenCalledOnce();
  });
  it.each(['light', 'dark'])('uses separate focus and pressed states in %s', (scheme) => {
    h.scheme = scheme;
    const palette = colors[scheme as keyof typeof colors];
    const component = () => Action({ label: '繼續', onPress: vi.fn() });
    let element = render(component);
    expect(style(element, true).backgroundColor).toBe(palette.primaryPressed);
    (element.props.onFocus as () => void)();
    element = render(component);
    expect(style(element).borderColor).toBe(palette.focus);
    expect(Number(style(element).paddingVertical) + Number(style(element).borderWidth)).toBe(13);
  });
});

describe('Notice announcements', () => {
  it('keeps general explanations quiet, and announces only changed important text on iOS', () => {
    let message = '沒有提交';
    let important = false;
    const component = () => Notice({ children: message, tone: important ? 'danger' : 'info' });
    let element = render(component);
    expect(find(element, 'Text').props.role).toBeUndefined();
    expect(h.announce).not.toHaveBeenCalled();
    important = true;
    element = render(component);
    expect(find(element, 'Text').props).toMatchObject({
      role: 'alert',
      accessibilityLiveRegion: 'polite',
    });
    expect(h.announce).toHaveBeenCalledWith(message, { queue: true });
    render(component);
    expect(h.announce).toHaveBeenCalledOnce();
    message = '請重新登入';
    render(component);
    expect(h.announce).toHaveBeenCalledTimes(2);
  });
  it.each(['android', 'web'])(
    'uses native live regions without double announcing on %s',
    (platform) => {
      h.platform = platform;
      const element = render(() =>
        Notice({ children: '失敗', tone: 'danger', announce: 'assertive' })
      );
      expect(find(element, 'Text').props.accessibilityLiveRegion).toBe('assertive');
      expect(h.announce).not.toHaveBeenCalled();
    }
  );
  it('supports a short progress summary and quiet autosave/countdown updates', () => {
    let children = '正在保存草稿';
    const component = () => Notice({ children, role: 'status', announce: 'none' });
    expect(find(render(component), 'Text').props.role).toBe('status');
    children = '草稿已存本機，尚未入帳';
    render(component);
    expect(h.announce).not.toHaveBeenCalled();
    render(() =>
      Notice({
        children: createElement('Text', null, '詳細內容'),
        announce: 'polite',
        announceText: '正在查詢結果',
      })
    );
    expect(h.announce).toHaveBeenCalledWith('正在查詢結果', { queue: true });
  });
});

describe('TextField', () => {
  it('preserves ref, keyboard, accessory, events and caller style through focus changes', () => {
    const inputRef = { current: null };
    const onFocus = vi.fn(),
      onBlur = vi.fn(),
      onChangeText = vi.fn(),
      onSubmitEditing = vi.fn();
    const component = () =>
      TextField({
        label: '金額',
        inputRef,
        keyboardType: 'decimal-pad',
        inputAccessoryViewID: 'done',
        value: '123.45',
        testID: 'amount',
        style: { textAlign: 'right' },
        onFocus,
        onBlur,
        onChangeText,
        onSubmitEditing,
      });
    let input = find(render(component), 'TextInput');
    expect(input.props).toMatchObject({
      ref: inputRef,
      keyboardType: 'decimal-pad',
      inputAccessoryViewID: 'done',
      value: '123.45',
      testID: 'amount',
      onChangeText,
      onSubmitEditing,
    });
    expect(style(input)).toMatchObject({ textAlign: 'right', lineHeight: 24 });
    const focusEvent = { nativeEvent: { text: '123.45' } };
    (input.props.onFocus as (event: unknown) => void)(focusEvent);
    expect(onFocus).toHaveBeenCalledWith(focusEvent);
    input = find(render(component), 'TextInput');
    expect(style(input).borderColor).toBe(colors.light.focus);
    (input.props.onBlur as (event: unknown) => void)(focusEvent);
    expect(onBlur).toHaveBeenCalledWith(focusEvent);
    expect(style(find(render(component), 'TextInput')).borderColor).toBe(
      colors.light.controlBorder
    );
  });
  it('keeps errors and hints on the same field and does not announce repeated rerenders', () => {
    const component = () =>
      TextField({
        label: '日期',
        description: 'YYYY-MM-DD',
        accessibilityHint: '旅行當地日期',
        error: '日期不合法',
      });
    const element = render(component);
    const input = find(element, 'TextInput');
    expect(input.props.accessibilityHint).toBe('旅行當地日期. YYYY-MM-DD. 日期不合法');
    expect(style(input).borderColor).toBe(colors.light.danger);
    expect(h.announce).toHaveBeenCalledWith('日期不合法', { queue: true });
    render(component);
    expect(h.announce).toHaveBeenCalledOnce();
  });
  it('allows multiline text and full text scaling, and visibly disables read-only input', () => {
    const input = find(
      render(() => TextField({ label: '說明', multiline: true, editable: false })),
      'TextInput'
    );
    expect(style(input)).toMatchObject({
      textAlignVertical: 'top',
      backgroundColor: colors.light.disabled,
      color: colors.light.onDisabled,
    });
    expect(style(input).height).toBeUndefined();
    expect(input.props.maxFontSizeMultiplier).toBeUndefined();
    expect(input.props.allowFontScaling).toBeUndefined();
  });
});

describe('selectable and decorative components', () => {
  it.each(['radio', 'checkbox', 'button'] as const)(
    'keeps %s semantics, a visible check and a blocked disabled callback',
    (role) => {
      const onPress = vi.fn();
      const chip = render(() =>
        Chip({
          label: '很長的成員名稱',
          role,
          selected: true,
          disabled: true,
          testID: 'member',
          onPress,
        })
      );
      expect(chip.props).toMatchObject({
        accessibilityRole: role,
        testID: 'member',
        accessibilityState: { disabled: true },
      });
      expect((chip.props.accessibilityState as Record<string, unknown>).checked).toBe(
        role === 'button' ? undefined : true
      );
      expect(find(chip, Icon).props.name).toBe('check');
      expect(style(chip).minHeight).toBeGreaterThanOrEqual(sizing.touch);
      expect(style(find(chip, 'Text')).flexShrink).toBe(1);
      press(chip);
      expect(onPress).not.toHaveBeenCalled();
    }
  );
  it('keeps card children reachable and icons decorative', () => {
    const child = createElement('Pressable', { testID: 'child' });
    const card = render(() => Card({ children: child, testID: 'card' }));
    expect(card.props.accessible).toBe(false);
    expect(card.props.importantForAccessibility).toBeUndefined();
    expect(find(card, 'Pressable').props.testID).toBe('child');
    const icon = Icon({ name: 'check', color: colors.light.primary }) as Element;
    expect(icon.props).toMatchObject({
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      pointerEvents: 'none',
    });
    const badge = render(() => Badge({ label: '已入帳', tone: 'success' }));
    expect(style(find(badge, 'Text')).color).toBe(colors.light.success);
  });
  it('keeps scroll and keyboard dismissal behavior for forms', () => {
    const page = render(() => Page({ form: true, children: '表單' }));
    expect(find(page, 'ScrollView').props).toMatchObject({
      keyboardShouldPersistTaps: 'handled',
      keyboardDismissMode: 'on-drag',
    });
  });
});
