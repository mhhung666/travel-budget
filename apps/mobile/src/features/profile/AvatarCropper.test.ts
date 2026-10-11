import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { AvatarCropper } from './AvatarCropper';
const h = vi.hoisted(() => ({
  state: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  j: 0,
  cleanups: [] as (() => void)[],
  effectRan: false,
  crop: vi.fn(),
  remove: vi.fn(),
  cancel: vi.fn(),
  complete: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.i++;
    if (!(i in h.state))
      h.state[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [
      h.state[i],
      (value: unknown) => {
        h.state[i] = value;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.j++] ??= { current: initial }),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => () => void) => {
    if (!h.effectRan) {
      h.cleanups.push(effect());
      h.effectRan = true;
    }
  },
}));
vi.mock('react-native', () => ({
  Image: 'Image',
  Modal: 'Modal',
  ScrollView: 'ScrollView',
  Text: 'Text',
  View: 'View',
  Platform: { OS: 'ios' },
  AccessibilityInfo: { sendAccessibilityEvent: vi.fn() },
  PanResponder: { create: (handlers: unknown) => ({ panHandlers: handlers }) },
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));
vi.mock('@/components/ui', () => ({ Action: 'Action', Copy: 'Copy', Notice: 'Notice' }));
vi.mock('@/theme/usePalette', () => ({ usePalette: () => ({}) }));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => new Proxy({}, { get: (_o, k) => String(k) }),
}));
vi.mock('./avatarFiles', () => ({
  avatarFileUri: () => 'file://source',
  cropAvatar: h.crop,
  removeAvatarFile: h.remove,
}));
const source = {
    file: '11111111-1111-4111-8111-111111111111',
    width: 800,
    height: 1200,
    size: 100,
    contentType: 'image/jpeg' as const,
  },
  result = {
    file: '22222222-2222-4222-8222-222222222222',
    size: 100,
    contentType: 'image/jpeg' as const,
  };
type E = ReactElement<Record<string, unknown>>;
function nodes(n: ReactNode): E[] {
  if (Array.isArray(n)) return n.flatMap(nodes);
  if (!isValidElement(n)) return [];
  const e = n as E;
  return [e, ...nodes(e.props.children as ReactNode)];
}
function render() {
  h.i = h.j = 0;
  return nodes(AvatarCropper({ source, onCancel: h.cancel, onComplete: h.complete }));
}
function find(id: string) {
  return render().find((e) => e.props.testID === id)!;
}
function invoke(element: E, prop: string, value?: unknown) {
  return (element.props[prop] as (value?: unknown) => void)(value);
}
function ready() {
  const tree = render(),
    container = tree.find((e) => e.props.onLayout)!;
  invoke(container, 'onLayout', { nativeEvent: { layout: { width: 400, height: 500 } } });
  invoke(
    tree.find((e) => e.type === 'Image')!,
    'onLoad'
  );
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.clearAllMocks();
  h.state = [];
  h.refs = [];
  h.cleanups = [];
  h.effectRan = false;
  h.crop.mockResolvedValue(result);
  h.remove.mockResolvedValue(undefined);
  h.complete.mockResolvedValue(undefined);
});
it('waits for the image, cancels without cropping, and completes only once without network writes', async () => {
  expect(find('avatar-crop-done').props.disabled).toBe(true);
  invoke(find('avatar-crop-cancel'), 'onPress');
  expect(h.cancel).toHaveBeenCalledTimes(1);
  expect(h.crop).not.toHaveBeenCalled();
  ready();
  let resolve!: (value: typeof result) => void;
  h.crop.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const done = find('avatar-crop-done');
  invoke(done, 'onPress');
  invoke(done, 'onPress');
  invoke(find('avatar-crop-cancel'), 'onPress');
  expect(h.cancel).toHaveBeenCalledTimes(1);
  expect(h.crop).toHaveBeenCalledTimes(1);
  expect(h.crop).toHaveBeenCalledWith(source, {
    originX: 0,
    originY: 200,
    width: 800,
    height: 800,
  });
  resolve(result);
  await flush();
  expect(h.complete).toHaveBeenCalledExactlyOnceWith(result);
  expect(h.remove).not.toHaveBeenCalled();
});
it('applies drag and pinch, reseeds finger transitions without jumps, and supports accessible positioning', async () => {
  ready();
  const frame = () => find('avatar-crop-frame');
  const touch = (x: number, y: number) => ({
    locationX: x,
    locationY: y,
    pageX: x + 10,
    pageY: y + 50,
  });
  const event = (...touches: ReturnType<typeof touch>[]) => ({ nativeEvent: { touches } });
  invoke(frame(), 'onPanResponderGrant', event(touch(150, 200), touch(250, 200)));
  invoke(frame(), 'onPanResponderMove', event(touch(100, 200), touch(300, 200)));
  expect(frame().props.accessibilityValue).toMatchObject({ now: 200 });
  invoke(frame(), 'onPanResponderEnd', event(touch(300, 200)));
  invoke(frame(), 'onPanResponderMove', event(touch(350, 200)));
  invoke(frame(), 'onAccessibilityAction', { nativeEvent: { actionName: 'up' } });
  invoke(find('avatar-crop-done'), 'onPress');
  await flush();
  expect(h.crop).toHaveBeenCalledWith(source, {
    originX: 150,
    originY: 440,
    width: 400,
    height: 400,
  });
});
it('keeps source coordinates on resize and resets to a centered crop', async () => {
  ready();
  invoke(find('avatar-crop-increment'), 'onPress');
  const layout = render().find((e) => e.props.onLayout)!;
  invoke(layout, 'onLayout', { nativeEvent: { layout: { width: 1024, height: 700 } } });
  expect(find('avatar-crop-frame').props.style).toMatchObject({ width: 560, height: 560 });
  expect(find('avatar-crop-frame').props.accessibilityValue).toMatchObject({ now: 120 });
  invoke(find('avatar-crop-reset'), 'onPress');
  invoke(find('avatar-crop-done'), 'onPress');
  await flush();
  expect(h.crop).toHaveBeenCalledWith(source, {
    originX: 0,
    originY: 200,
    width: 800,
    height: 800,
  });
});
it('shows crop failures with retry and keeps failed loads cancellable', async () => {
  ready();
  h.crop.mockRejectedValueOnce(new Error('decoder failed'));
  invoke(find('avatar-crop-done'), 'onPress');
  await flush();
  expect(render().some((e) => e.props.children === 'avatarCropFailed')).toBe(true);
  expect(h.complete).not.toHaveBeenCalled();
  invoke(
    render().find((e) => e.type === 'Image')!,
    'onError'
  );
  expect(find('avatar-crop-done').props.disabled).toBe(true);
  invoke(
    render().find((e) => e.type === 'Modal')!,
    'onRequestClose'
  );
  expect(h.cancel).toHaveBeenCalledTimes(1);
});
it('clears a late cropped file after unmount without updating the parent', async () => {
  ready();
  let resolve!: (value: typeof result) => void;
  h.crop.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  invoke(find('avatar-crop-done'), 'onPress');
  h.cleanups.forEach((cleanup) => cleanup());
  resolve(result);
  await flush();
  expect(h.complete).not.toHaveBeenCalled();
  expect(h.remove).toHaveBeenCalledExactlyOnceWith(result.file);
});
