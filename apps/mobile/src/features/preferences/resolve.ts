import type { AppLocale } from '@/i18n/messages';
import type { Preferences } from './store';
interface DeviceLocale {
  languageCode: string | null;
  languageScriptCode?: string | null;
  regionCode?: string | null;
}
export function resolveLocale(language: Preferences['language'], device?: DeviceLocale): AppLocale {
  if (language !== 'system') return language;
  if (device?.languageCode === 'ja') return 'jp';
  if (device?.languageCode === 'zh') {
    return device.languageScriptCode === 'Hans' ||
      (!device.languageScriptCode && (device.regionCode === 'CN' || device.regionCode === 'SG'))
      ? 'zh-CN'
      : 'zh';
  }
  return 'en';
}
export function resolveAppearance(
  appearance: Preferences['appearance'],
  system: string | null | undefined
) {
  return appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : appearance;
}
