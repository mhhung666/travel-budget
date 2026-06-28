/**
 * 本地化相對時間格式化，供站內通知（鈴鐺）與動態牆共用。
 */

/** Intl 不認得本專案的 `jp`（日語標準碼為 `ja`）；其餘 locale 直接沿用。 */
export function intlLocale(locale: string): string {
  return locale === 'jp' ? 'ja' : locale;
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
