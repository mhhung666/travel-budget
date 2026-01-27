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
