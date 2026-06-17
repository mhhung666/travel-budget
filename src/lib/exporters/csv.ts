/**
 * 極簡 CSV 產生器（RFC 4180），無外部依賴。
 */

/** UTF-8 BOM，讓 Excel 正確以 UTF-8 開啟（避免中文亂碼） */
const BOM = '﻿';

/**
 * 跳脫單一欄位：含有逗號、雙引號、換行（\n 或 \r）時以雙引號包起，
 * 內部雙引號加倍。其餘原樣輸出。
 */
export function escapeCsvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 把表頭 + 資料列組成 CSV 字串。以 CRLF 換行（RFC 4180），前置 BOM。
 */
export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((cells) => cells.map(escapeCsvField).join(','));
  return BOM + lines.join('\r\n');
}
