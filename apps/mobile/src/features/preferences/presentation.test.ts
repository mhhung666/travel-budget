import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { PreferenceStore, defaults } from './store';
import { resolveLocale } from './resolve';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { usePalette } from '@/theme/usePalette';
import { colors } from '@/theme/tokens';
import { PreferencesScreen } from './PreferencesScreen';
import { AppAppearance } from './AppAppearance';
import { websiteUrl } from './website';
import { version } from '../../../package.json';
const h = vi.hoisted(() => ({
  store: null as unknown as PreferenceStore,
  device: {
    languageCode: 'en',
    languageScriptCode: null as string | null,
    regionCode: null as string | null,
  },
  scheme: 'light',
  setScheme: vi.fn(),
  open: vi.fn(async () => {}),
  back: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (v: unknown) => [v, vi.fn()],
  useEffect: (fn: () => void) => fn(),
}));
vi.mock('./context', () => ({
  usePreferences: () => ({ ...h.store.getSnapshot(), store: h.store }),
}));
vi.mock('expo-localization', () => ({ useLocales: () => [h.device] }));
vi.mock('react-native', () => ({
  useColorScheme: () => h.scheme,
  Appearance: { setColorScheme: h.setScheme },
  Platform: { OS: 'ios' },
  Linking: { openURL: h.open },
}));
vi.mock('expo-router', () => ({
  ThemeProvider: 'ThemeProvider',
  DarkTheme: { dark: true, colors: {} },
  DefaultTheme: { dark: false, colors: {} },
}));
vi.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
vi.mock('@/components/ui', () =>
  Object.fromEntries(
    ['Action', 'Card', 'Chip', 'Copy', 'DetailRow', 'Notice', 'Page', 'Section'].map((k) => [k, k])
  )
);
vi.mock('@/components/screen', () => ({ PageHeader: 'PageHeader' }));
vi.mock('@/components/navigation', () => ({ goBack: h.back }));
type Node = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function nodes(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const n = node as Node;
  return [n, ...nodes(n.props.children)];
}
function find(id: string) {
  return nodes(PreferencesScreen()).find((n) => n.props.testID === id)!;
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('__DEV__', true);
  vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'https://api.example.test');
  vi.stubEnv('EXPO_PUBLIC_WEB_ORIGIN', 'https://web.example.test');
  h.store = new PreferenceStore({ read: async () => null, write: async () => {} });
  await h.store.start();
  h.device = { languageCode: 'en', languageScriptCode: null, regionCode: null };
  h.scheme = 'light';
});
it('maps device locales, respects Chinese script, and falls back to English', () => {
  expect(resolveLocale('system', { languageCode: 'ja' })).toBe('jp');
  expect(resolveLocale('system', { languageCode: 'zh', regionCode: 'SG' })).toBe('zh-CN');
  expect(
    resolveLocale('system', { languageCode: 'zh', regionCode: 'CN', languageScriptCode: 'Hant' })
  ).toBe('zh');
  expect(resolveLocale('system', { languageCode: 'zh', languageScriptCode: 'Hans' })).toBe('zh-CN');
  expect(resolveLocale('system', { languageCode: 'fr' })).toBe('en');
  expect(resolveLocale('system')).toBe('en');
});
it('updates copy, date formatting, palette, navigation and status bar without replacing children', async () => {
  const child = { type: 'existing-form' };
  await h.store.update({ language: 'jp', appearance: 'dark' });
  expect(useAppLocale()).toBe('jp');
  expect(useMessages().preferenceLanguage).toBe('言語');
  expect(useDisplayFormat().date('2026-10-10')).toBe('2026年10月10日');
  expect(usePalette()).toBe(colors.dark);
  const tree = AppAppearance({ children: child as unknown as ReactNode });
  expect(tree.props.value.dark).toBe(true);
  expect(nodes(tree).find((n) => n.type === ('StatusBar' as unknown))?.props.style).toBe('light');
  expect(tree.props.children[1]).toBe(child);
  expect(h.setScheme).toHaveBeenLastCalledWith('dark');
  h.device.languageCode = 'en';
  h.scheme = 'light';
  expect(useAppLocale()).toBe('jp');
  expect(usePalette()).toBe(colors.dark);
  await h.store.reset();
  AppAppearance({});
  expect(h.setScheme).toHaveBeenLastCalledWith('unspecified');
  h.scheme = 'dark';
  h.device.languageCode = 'ja';
  expect(usePalette()).toBe(colors.dark);
  expect(useAppLocale()).toBe('jp');
  h.scheme = 'light';
  h.device.languageCode = 'en';
  expect(usePalette()).toBe(colors.light);
  expect(useDisplayFormat().date('2026-10-10')).toBe('Oct 10, 2026');
});
it('wires language/theme/reset controls and reads the package version', async () => {
  (find('preference-language-zh-CN').props.onPress as () => void)();
  await vi.waitFor(() => expect(h.store.getSnapshot().value.language).toBe('zh-CN'));
  (find('preference-appearance-light').props.onPress as () => void)();
  await vi.waitFor(() => expect(h.store.getSnapshot().value.appearance).toBe('light'));
  expect(find('preference-language-zh-CN').props.selected).toBe(true);
  expect(nodes(PreferencesScreen()).some((n) => n.props.value === version)).toBe(true);
  (find('preferences-reset').props.onPress as () => void)();
  await vi.waitFor(() => expect(h.store.getSnapshot().value).toEqual(defaults));
  (find('preferences-website').props.onPress as () => void)();
  expect(h.open).toHaveBeenCalledWith('https://web.example.test/');
});
it('disables selection after read failure but offers retry and reset', async () => {
  h.store = new PreferenceStore({
    read: async () => {
      throw Error();
    },
    write: async () => {},
  });
  await h.store.start();
  expect(find('preference-language-en').props.disabled).toBe(true);
  expect(find('preferences-retry')).toBeDefined();
  (find('preferences-reset').props.onPress as () => void)();
  await vi.waitFor(() => expect(h.store.getSnapshot().loaded).toBe(true));
});
it('opens only configured public origins and rejects credentials, paths and insecure release links', () => {
  expect(websiteUrl('https://api.test/api/v2', undefined, false)).toBe('https://api.test/');
  expect(websiteUrl('http://localhost:3000', undefined, true)).toBe('http://localhost:3000/');
  for (const web of [
    'javascript:alert(1)',
    'https://user:secret@host.test',
    'https://host.test/private',
    'https://host.test/?token=x',
    'http://host.test',
  ])
    expect(websiteUrl('https://api.test', web, false)).toBeNull();
  expect(websiteUrl(undefined, 'https://web.test', false)).toBeNull();
});
