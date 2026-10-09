import { useLocales } from 'expo-localization';
import { usePreferences } from '@/features/preferences/context';
import { resolveLocale } from '@/features/preferences/resolve';
import { ledgerMessages } from './ledgerMessages';

export function useAppLocale() {
  const [deviceLocale] = useLocales();
  const { value } = usePreferences();
  return resolveLocale(value.language, deviceLocale);
}
export function useMessages(base = 'TWD') {
  return ledgerMessages(useAppLocale(), base);
}
