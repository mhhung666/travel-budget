import type { ItineraryDay } from '@/types';
import type { ExportFile, ExportFormat } from './types';
import { FORMAT_META } from './types';
import { toCsv } from './csv';

/** 已在地化的標籤（由元件以 next-intl 提供；測試可直接傳入） */
export interface ItineraryLabels {
  /** 文件主標題，例如「行程規劃」 */
  heading: string;
  /** 第 n 天的顯示文字，例如 (1) => 「第 1 天」/「Day 1」 */
  day: (n: number) => string;
  /** CSV 表頭 */
  columns: { day: string; title: string; content: string };
}

function toMarkdown(days: ItineraryDay[], labels: ItineraryLabels): string {
  const parts = [`# ${labels.heading}`, ''];
  for (const d of days) {
    parts.push(`## ${labels.day(d.day_number)} — ${d.title}`);
    if (d.content.trim()) {
      parts.push('', d.content.trim());
    }
    parts.push('');
  }
  return parts.join('\n').trimEnd() + '\n';
}

function toItineraryCsv(days: ItineraryDay[], labels: ItineraryLabels): string {
  const { columns } = labels;
  return toCsv(
    [columns.day, columns.title, columns.content],
    days.map((d) => [d.day_number, d.title, d.content])
  );
}

/**
 * 把行程規劃序列化成指定格式。
 */
export function exportItinerary(
  days: ItineraryDay[],
  format: ExportFormat,
  labels: ItineraryLabels
): ExportFile {
  const meta = FORMAT_META[format];
  let content: string;
  switch (format) {
    case 'markdown':
      content = toMarkdown(days, labels);
      break;
    case 'csv':
      content = toItineraryCsv(days, labels);
      break;
    case 'json':
      content = JSON.stringify(days, null, 2);
      break;
  }
  return { content, ...meta };
}
