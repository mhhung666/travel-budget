import { useLocales } from 'expo-localization';

import { messages, type AppLocale } from './messages';

export function useAppLocale(): AppLocale {
  const [deviceLocale] = useLocales();
  let locale: AppLocale = 'en';

  if (deviceLocale?.languageCode === 'ja') locale = 'jp';
  if (deviceLocale?.languageCode === 'zh') {
    const script = deviceLocale.languageScriptCode;
    const region = deviceLocale.regionCode;
    locale =
      script === 'Hans' || (!script && (region === 'CN' || region === 'SG')) ? 'zh-CN' : 'zh';
  }

  return locale;
}

export function useMessages() {
  return messages[useAppLocale()];
}
