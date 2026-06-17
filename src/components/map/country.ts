/**
 * 把 ISO 3166-1 alpha-2 國碼轉成國旗 emoji（兩個區域指示符號）。
 * 無效或缺值時回傳空字串，呼叫端自行 fallback。
 */
export function countryCodeToFlag(code?: string): string {
  if (!code) return '';
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * 由國碼推導出穩定的色相，讓同一國家在地圖上配色一致。
 * 沒有國碼時退回中性藍。
 */
export function countryColor(code?: string): string {
  if (!code) return 'hsl(217, 91%, 60%)';
  const key = code.toUpperCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 65%, 50%)`;
}
