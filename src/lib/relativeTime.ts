/**
 * 本地化相對時間格式化，供站內通知（鈴鐺）與動態牆共用。
 */

/**
 * 把本專案的 locale 代碼對映成 Intl 認得的 BCP-47 標籤：
 * - `jp`：本專案自用碼，日語標準碼為 `ja`。
 * - `zh`：本專案用來代表**繁體中文**，但 Intl 的 `zh` 會解析成簡體（輸出「4小时前」），
 *   故明確對映 `zh-TW`；`zh-CN` 本就是簡中，維持原樣。
 */
export function intlLocale(locale: string): string {
  if (locale === 'jp') return 'ja';
  if (locale === 'zh') return 'zh-TW';
  return locale;
}

/** 將 ISO 時間轉成本地化相對時間（「3 分鐘前」）。 */
export function formatRelativeTime(iso: string, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  const diffMon = Math.round(diffDay / 30);
  if (Math.abs(diffMon) < 12) return rtf.format(diffMon, 'month');
  return rtf.format(Math.round(diffMon / 12), 'year');
}
