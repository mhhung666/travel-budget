import { activityTimingText, type ActivityTimingLabels } from '@/lib/activityTiming';
import { dateForDayNumber } from '@/lib/itineraryDayTarget';
import type { Activity, ItineraryDay } from '@/types';
import { sortActivities } from '@/lib/itineraryActivities';
import type { ExportFile, ExportFormat } from './types';
import { FORMAT_META } from './types';
import { toCsv } from './csv';

/** 已在地化的標籤（由元件以 next-intl 提供；測試可直接傳入） */
export interface ItineraryLabels {
  /** 文件主標題，例如「行程規劃」 */
  heading: string;
  timing: ActivityTimingLabels;
  startDate?: string | null;
  activityColumn: string;
  startColumn: string;
  endColumn: string;
  /** 第 n 天的顯示文字，例如 (1) => 「第 1 天」/「Day 1」 */
  day: (n: number) => string;
  /** CSV 表頭 */
  columns: { day: string; title: string; content: string };
  /** 活動類型在地化標籤（選填；缺時退回原始 type 字串）。 */
  activityTypes?: Record<string, string>;
}

/** 把單一活動序列化成一行 markdown 清單項目。 */
function activityLine(activity: Activity, day: ItineraryDay, labels: ItineraryLabels): string {
  const date = labels.startDate ? dateForDayNumber(labels.startDate, day.day_number) : null;
  const time = activityTimingText(activity, day.day_number, date, labels.timing).summary;
  const typeLabel = labels.activityTypes?.[activity.type] ?? activity.type;
  const segments = [
    time,
    `**${activity.title}**`,
    `(${typeLabel})`,
    activity.location?.name,
    activity.note || undefined,
    activity.confirmation_code || undefined,
  ].filter(Boolean);
  return `- ${segments.join(' · ')}`;
}

function toMarkdown(days: ItineraryDay[], labels: ItineraryLabels): string {
  const parts = [`# ${labels.heading}`, ''];
  for (const d of days) {
    parts.push(`## ${labels.day(d.day_number)} — ${d.title}`);
    if (d.content.trim()) {
      parts.push('', d.content.trim());
    }
    if (d.activities.length > 0) {
      parts.push('', ...sortActivities(d.activities).map((a) => activityLine(a, d, labels)));
    }
    parts.push('');
  }
  return parts.join('\n').trimEnd() + '\n';
}

function toItineraryCsv(days: ItineraryDay[], labels: ItineraryLabels): string {
  const { columns } = labels;
  return toCsv(
    [
      columns.day,
      columns.title,
      columns.content,
      labels.activityColumn,
      labels.startColumn,
      labels.endColumn,
    ],
    days.flatMap((d) => {
      if (!d.activities.length) return [[d.day_number, d.title, d.content, '', '', '']];
      const date = labels.startDate ? dateForDayNumber(labels.startDate, d.day_number) : null;
      return sortActivities(d.activities).map((a) => {
        const summary = activityTimingText(a, d.day_number, date, labels.timing).summary;
        const [start, end] = summary.split(' → ');
        return [d.day_number, d.title, d.content, a.title, start, end];
      });
    })
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
