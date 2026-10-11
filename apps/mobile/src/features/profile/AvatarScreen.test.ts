import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { AvatarScreen } from './AvatarScreen';
import type { LocalAvatarWrite } from '@/storage/avatarWrites';
const h = vi.hoisted(() => ({
  state: {
    record: null as LocalAvatarWrite | null,
    busy: false,
    loaded: true,
    error: undefined as unknown,
  },
  selected: null as null | { file: string; size: number; contentType: 'image/jpeg' },
  source: undefined as
    | undefined
    | { file: string; size: number; contentType: 'image/jpeg'; width: number; height: number },
  stateIndex: 0,
  refIndex: 0,
  refs: [] as { current: unknown }[],
  version: 1,
  status: 'signedIn',
  online: true,
  guard: vi.fn(),
  lookup: vi.fn(),
  retry: vi.fn(),
  cancel: vi.fn(),
  dismiss: vi.fn(),
  load: vi.fn(),
  confirm: vi.fn(),
  refetch: vi.fn(),
  pick: vi.fn(),
  remove: vi.fn(),
  alert: vi.fn(),
}));
vi.mock('react', async (o) => ({
  ...(await o<typeof import('react')>()),
  useState: (v: unknown) => {
    const index = h.stateIndex++;
    return [
      index === 1
        ? h.selected
        : index === 2
          ? h.source
          : typeof v === 'function'
            ? (v as () => unknown)()
            : v,
      (value: unknown) => {
        if (index === 1) h.selected = value as typeof h.selected;
        if (index === 2) h.source = value as typeof h.source;
      },
    ];
  },
  useRef: (v: unknown) => (h.refs[h.refIndex++] ??= { current: v }),
  useEffect: (e: () => void) => e(),
  useSyncExternalStore: (_s: unknown, r: () => unknown) => r(),
}));
vi.mock('react-native', () => ({
  Alert: { alert: h.alert },
  AppState: { currentState: 'active' },
  View: 'View',
  Pressable: 'Pressable',
}));
vi.mock('expo-router', () => ({ useNavigation: () => ({ dispatch: vi.fn() }) }));
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: h.guard }));
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  onlineManager: { isOnline: () => true },
}));
vi.mock('./AvatarWriter', () => ({
  AvatarWriter: class {
    getSnapshot = () => h.state;
    subscribe = vi.fn();
    load = h.load;
    lookup = h.lookup;
    retry = h.retry;
    cancel = h.cancel;
    dismiss = h.dismiss;
    confirm = h.confirm;
  },
}));
vi.mock('./AvatarPreview', () => ({ AvatarPreview: 'AvatarPreview' }));
vi.mock('./AvatarCropper', () => ({ AvatarCropper: 'AvatarCropper' }));
vi.mock('./avatarFiles', () => ({
  pickAvatar: h.pick,
  removeAvatarFile: h.remove,
  uploadAvatarFile: vi.fn(),
  avatarFileUri: () => 'file://selected',
  cleanupAvatarFiles: vi.fn(),
}));
vi.mock('@/storage/avatarWriteDatabase', () => ({
  openAvatarWriteStore: async () => ({ files: async () => [] }),
}));
vi.mock('./useAccountAvatar', () => ({
  useAccountAvatar: () => ({
    data: { avatarUrl: 'https://cdn.example.invalid/current', revision: 'a'.repeat(64) },
    queryKey: ['a'],
    refetch: h.refetch,
  }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: h.status,
    user: { id: 'a'.repeat(24) },
    manager: { api: { environment: 'test' }, getSignInVersion: () => h.version },
  }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage' }));
vi.mock('@/components/navigation', () => ({ goBack: vi.fn() }));
vi.mock('@/components/ui', () =>
  Object.fromEntries(['Action', 'Card', 'Copy', 'Icon', 'Notice'].map((s) => [s, s]))
);
vi.mock('@/theme/usePalette', () => ({ usePalette: () => ({}) }));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => new Proxy({}, { get: (_o, k) => String(k) }),
}));
type E = ReactElement<Record<string, unknown>>;
function nodes(n: ReactNode): E[] {
  if (Array.isArray(n)) return n.flatMap(nodes);
  if (!isValidElement(n)) return [];
  const e = n as E;
  return [e, ...nodes(e.props.children as ReactNode)];
}
function render() {
  h.stateIndex = h.refIndex = 0;
  const e = AvatarScreen()!;
  return (e.type as () => ReactElement)();
}
const find = (tree: ReactNode, id: string) => nodes(tree).find((e) => e.props.testID === id);
beforeEach(() => {
  vi.clearAllMocks();
  h.state = { record: null, busy: false, loaded: true, error: undefined };
  h.selected = null;
  h.source = undefined;
  h.refs = [];
  h.pick.mockResolvedValue({
    file: '33333333-3333-4333-8333-333333333333',
    size: 100,
    contentType: 'image/jpeg',
    width: 800,
    height: 1200,
  });
  h.remove.mockResolvedValue(undefined);
  h.online = true;
  h.status = 'signedIn';
});
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
it('opens adjustment without replacing an existing selection, cancels safely and adopts only a completed crop', async () => {
  const old = {
    file: '22222222-2222-4222-8222-222222222222',
    size: 100,
    contentType: 'image/jpeg' as const,
  };
  h.selected = old;
  (find(render(), 'avatar-pick')!.props.onPress as () => void)();
  await flush();
  let cropper = nodes(render()).find((e) => e.type === 'AvatarCropper')!;
  expect(cropper).toBeDefined();
  expect(h.selected).toEqual(old);
  expect(h.confirm).not.toHaveBeenCalled();
  (cropper.props.onCancel as () => void)();
  await flush();
  expect(h.source).toBeUndefined();
  expect(h.selected).toEqual(old);
  expect(h.remove).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
  (find(render(), 'avatar-pick')!.props.onPress as () => void)();
  await flush();
  cropper = nodes(render()).find((e) => e.type === 'AvatarCropper')!;
  const cropped = {
    file: '44444444-4444-4444-8444-444444444444',
    size: 200,
    contentType: 'image/jpeg' as const,
  };
  await (cropper.props.onComplete as (file: typeof cropped) => Promise<void>)(cropped);
  expect(h.selected).toEqual(cropped);
  expect(h.source).toBeUndefined();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(find(render(), 'avatar-confirm')).toBeDefined();
});
it('drops a completed crop after the sign-in generation changes', async () => {
  (find(render(), 'avatar-pick')!.props.onPress as () => void)();
  await flush();
  const cropper = nodes(render()).find((e) => e.type === 'AvatarCropper')!,
    cropped = {
      file: '44444444-4444-4444-8444-444444444444',
      size: 200,
      contentType: 'image/jpeg' as const,
    };
  h.version++;
  await (cropper.props.onComplete as (file: typeof cropped) => Promise<void>)(cropped);
  expect(h.selected).toBeNull();
  expect(h.remove).toHaveBeenCalledWith(cropped.file);
  expect(h.confirm).not.toHaveBeenCalled();
});
it('requires explicit destructive removal confirmation and does not upload on choosing', () => {
  const tree = render();
  expect(find(tree, 'avatar-pick')).toBeDefined();
  expect(find(tree, 'avatar-pick')!.type).toBe('Pressable');
  expect(find(tree, 'avatar-pick')!.props.accessibilityLabel).toBe('avatarChoose');
  expect(
    nodes(tree).some((e) => e.props.label === 'refresh' || e.props.label === 'avatarChoose')
  ).toBe(false);
  expect(h.confirm).not.toHaveBeenCalled();
  (find(tree, 'avatar-remove')!.props.onPress as () => void)();
  expect(h.confirm).not.toHaveBeenCalled();
  const buttons = h.alert.mock.calls[0][2];
  buttons[1].onPress();
  expect(h.confirm).toHaveBeenCalledWith({
    action: 'remove',
    client_request_id: '11111111-1111-4111-8111-111111111111',
    expectedRevision: 'a'.repeat(64),
  });
});
it('replaces the single displayed avatar with the unconfirmed photo and restores the current image when selection is cleared', () => {
  h.selected = {
    file: '22222222-2222-4222-8222-222222222222',
    size: 100,
    contentType: 'image/jpeg',
  };
  let tree = render();
  let previews = nodes(tree).filter((e) => e.type === 'AvatarPreview');
  expect(previews).toHaveLength(1);
  expect(previews[0].props.url).toBe('file://selected');
  expect(nodes(tree).some((e) => e.props.label === 'refresh')).toBe(false);
  expect(find(tree, 'avatar-confirm')).toBeDefined();
  expect(find(tree, 'avatar-remove')).toBeUndefined();
  expect(h.confirm).not.toHaveBeenCalled();
  h.selected = null;
  tree = render();
  previews = nodes(tree).filter((e) => e.type === 'AvatarPreview');
  expect(previews).toHaveLength(1);
  expect(previews[0].props.url).toBe('https://cdn.example.invalid/current');
  expect(find(tree, 'avatar-confirm')).toBeUndefined();
  expect(find(tree, 'avatar-remove')).toBeDefined();
  expect(h.confirm).not.toHaveBeenCalled();
});
it('pending outcome freezes new selection and exposes original lookup/retry/cancel, offline disables sending', () => {
  h.state.record = {
    input: {
      action: 'remove',
      client_request_id: '11111111-1111-4111-8111-111111111111',
      expectedRevision: 'a'.repeat(64),
    },
    cancel: false,
    result: null,
  };
  h.online = false;
  const tree = render();
  expect(find(tree, 'avatar-pick')).toBeUndefined();
  for (const id of ['avatar-lookup', 'avatar-retry', 'avatar-cancel'])
    expect(find(tree, id)?.props.disabled).toBe(true);
  expect(nodes(tree).some((e) => e.props.children === 'avatarPending')).toBe(true);
});
it('shows terminal conflict explanation and allows acknowledging without another upload', () => {
  h.state.record = {
    input: {
      action: 'remove',
      client_request_id: '11111111-1111-4111-8111-111111111111',
      expectedRevision: 'a'.repeat(64),
    },
    cancel: false,
    result: {
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      status: 'rejected',
      code: 'RESOURCE_CHANGED',
    },
  };
  const tree = render();
  expect(nodes(tree).some((e) => e.props.children === 'avatarChanged')).toBe(true);
  expect(find(tree, 'avatar-retry')).toBeUndefined();
  const action = nodes(tree).find((e) => e.props.label === 'dismissOperation')!;
  (action.props.onPress as () => void)();
  expect(h.dismiss).toHaveBeenCalled();
});
it('uses sign-in epoch keys, guards busy navigation, and excludes local/signed-out sessions', () => {
  h.state.busy = true;
  render();
  expect(h.guard.mock.calls[0][0]).toBe(true);
  const key = AvatarScreen()!.key;
  h.version++;
  expect(AvatarScreen()!.key).not.toBe(key);
  for (const s of ['local', 'signedOut']) {
    h.status = s;
    expect(AvatarScreen()).toBeNull();
  }
});

it('locks selection ownership synchronously when confirmation is clicked twice before persistence resolves', async () => {
  h.selected = {
    file: '22222222-2222-4222-8222-222222222222',
    size: 100,
    contentType: 'image/jpeg',
  };
  let resolve!: () => void;
  h.confirm.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      })
  );
  const tree = render();
  const press = find(tree, 'avatar-confirm')!.props.onPress as () => void;
  press();
  press();
  expect(h.confirm).toHaveBeenCalledTimes(1);
  resolve();
  await Promise.resolve();
});
