import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { AvatarPreview } from './AvatarPreview';
const h = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = h.index++;
    if (!(index in h.values)) h.values[index] = initial;
    return [h.values[index], (value: unknown) => (h.values[index] = value)];
  },
  useRef: () => ({ current: null }),
  useEffect: (effect: () => void) => effect(),
}));
vi.mock('react-native', () => ({
  Image: 'Image',
  Modal: 'Modal',
  Pressable: 'Pressable',
  View: 'View',
  AccessibilityInfo: { sendAccessibilityEvent: vi.fn() },
  Platform: { OS: 'ios' },
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));
vi.mock('@/components/ui', () => ({ Action: 'Action', Copy: 'Copy', Notice: 'Notice' }));
vi.mock('./AccountAvatar', () => ({ AvatarImage: 'AvatarImage' }));
vi.mock('@/theme/usePalette', () => ({ usePalette: () => ({ background: 'white' }) }));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => new Proxy({}, { get: (_o, k) => String(k) }),
}));
type E = ReactElement<Record<string, unknown>>;
function nodes(node: ReactNode): E[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const e = node as E;
  return [e, ...nodes(e.props.children as ReactNode)];
}
function render(url: string | null = 'https://cdn.example.invalid/avatar') {
  h.index = 0;
  return nodes(AvatarPreview({ url }));
}
function control(tree: E[], id: string) {
  return tree.find((e) => e.props.testID === id)!;
}
const press = (e: E) => (e.props.onPress as () => void)();
const modal = (tree: E[]) => tree.find((e) => e.type === 'Modal')!;
beforeEach(() => {
  h.values = [];
});
it('opens the supplied image without cropping and closes through the button, system back or accessibility escape', () => {
  let tree = render('file://selected-photo');
  expect(modal(tree).props.visible).toBe(false);
  press(control(tree, 'avatar-preview-open'));
  tree = render('file://selected-photo');
  expect(modal(tree).props.visible).toBe(true);
  expect(control(tree, 'avatar-preview-image').props).toMatchObject({
    source: { uri: 'file://selected-photo' },
    resizeMode: 'contain',
  });
  press(control(tree, 'avatar-preview-close'));
  expect(modal(render()).props.visible).toBe(false);
  for (const escape of [
    () => modal(render()).props.onRequestClose,
    () => render().find((e) => e.type === 'SafeAreaView')!.props.onAccessibilityEscape,
  ]) {
    press(control(render(), 'avatar-preview-open'));
    (escape() as () => void)();
    expect(modal(render()).props.visible).toBe(false);
  }
});
it('does not open an empty avatar and keeps failed image previews closable and retryable by reopening', () => {
  let tree = render(null);
  expect(control(tree, 'avatar-preview-open').props).toMatchObject({
    disabled: true,
    accessibilityLabel: 'avatarEmpty',
  });
  expect(modal(tree).props.visible).toBe(false);
  press(control(render(), 'avatar-preview-open'));
  tree = render();
  (control(tree, 'avatar-preview-image').props.onError as () => void)();
  tree = render();
  expect(control(tree, 'avatar-preview-image')).toBeUndefined();
  expect(tree.some((e) => e.props.children === 'avatarLoadFailed')).toBe(true);
  press(control(tree, 'avatar-preview-close'));
  press(control(render(), 'avatar-preview-open'));
  expect(control(render(), 'avatar-preview-image')).toBeDefined();
});
