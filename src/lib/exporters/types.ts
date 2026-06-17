/**
 * 匯出功能的共用型別。
 * 格式化層為純函式：吃資料 + 已在地化的標籤，吐出可下載的字串內容，
 * 不碰 React / next-intl，方便單元測試。
 */

export type ExportFormat = 'markdown' | 'csv' | 'json';

/** 一份可下載的檔案內容 */
export interface ExportFile {
  content: string;
  mimeType: string;
  /** 副檔名（不含點） */
  extension: string;
}

export const FORMAT_META: Record<ExportFormat, { mimeType: string; extension: string }> = {
  markdown: { mimeType: 'text/markdown;charset=utf-8', extension: 'md' },
  // BOM + text/csv 讓 Excel 正確辨識 UTF-8（中文不亂碼）
  csv: { mimeType: 'text/csv;charset=utf-8', extension: 'csv' },
  json: { mimeType: 'application/json;charset=utf-8', extension: 'json' },
};
