// 國旗 emoji 對照（常見國家）
export const countryFlags: Record<string, string> = {
  JP: '🇯🇵',
  CN: '🇨🇳',
  TW: '🇹🇼',
  HK: '🇭🇰',
  KR: '🇰🇷',
  TH: '🇹🇭',
  VN: '🇻🇳',
  SG: '🇸🇬',
  MY: '🇲🇾',
  US: '🇺🇸',
  GB: '🇬🇧',
  FR: '🇫🇷',
  DE: '🇩🇪',
  IT: '🇮🇹',
  ES: '🇪🇸',
  AU: '🇦🇺',
  NZ: '🇳🇿',
};

export function getCountryFlag(countryCode: string): string {
  return countryFlags[countryCode] || '🌍';
}

// 將 app 的 next-intl locale 對應到 Intl.DisplayNames 用的 BCP-47 標籤
const LOCALE_TO_BCP47: Record<string, string> = {
  zh: 'zh-Hant',
  'zh-CN': 'zh-Hans',
  jp: 'ja',
  en: 'en',
};

/**
 * 依當前語言把 ISO 國家代碼翻成在地化國名（例：JP → 日本 / Japan）。
 * 沒有代碼或無法解析時，退回建立旅行時存下的原字串。
 */
export function getLocalizedCountryName(
  countryCode: string | undefined,
  locale: string,
  fallback: string
): string {
  if (!countryCode) return fallback;
  try {
    const displayNames = new Intl.DisplayNames([LOCALE_TO_BCP47[locale] ?? 'en'], {
      type: 'region',
    });
    return displayNames.of(countryCode.toUpperCase()) ?? fallback;
  } catch {
    return fallback;
  }
}
