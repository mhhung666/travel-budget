import type { Expense } from '@/types';
import type { ExportFile, ExportFormat } from './types';
import { FORMAT_META } from './types';
import { toCsv } from './csv';

export interface ExpenseLabels {
  /** 文件主標題，例如「支出明細」 */
  heading: string;
  /** 合計列文字，例如「合計」 */
  total: string;
  columns: {
    date: string;
    description: string;
    category: string;
    payer: string;
    amountTwd: string;
    originalAmount: string;
    currency: string;
    rate: string;
    splits: string;
  };
  /** 類別 key → 在地化名稱 */
  category: (key: string) => string;
}

/** 穩定的 YYYY-MM-DD（避免時區/語系造成 diff 漂移） */
function isoDate(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? date : d.toISOString().slice(0, 10);
}

function splitsText(e: Expense): string {
  return e.splits.map((s) => `${s.display_name}: ${s.share_amount}`).join('; ');
}

/** markdown 表格單元格跳脫：管線符與換行 */
function mdCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function toMarkdown(expenses: Expense[], labels: ExpenseLabels): string {
  const { columns: c } = labels;
  const head = [c.date, c.description, c.category, c.payer, c.amountTwd, c.splits];
  const rows = expenses.map((e) => [
    isoDate(e.date),
    mdCell(e.description),
    mdCell(labels.category(e.category)),
    mdCell(e.payer_name),
    e.amount,
    mdCell(splitsText(e)),
  ]);
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const lines = [
    `# ${labels.heading}`,
    '',
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    '',
    `**${labels.total}: ${total}**`,
    '',
  ];
  return lines.join('\n');
}

function toExpenseCsv(expenses: Expense[], labels: ExpenseLabels): string {
  const { columns: c } = labels;
  return toCsv(
    [
      c.date,
      c.description,
      c.category,
      c.payer,
      c.amountTwd,
      c.originalAmount,
      c.currency,
      c.rate,
      c.splits,
    ],
    expenses.map((e) => [
      isoDate(e.date),
      e.description,
      labels.category(e.category),
      e.payer_name,
      e.amount,
      e.original_amount,
      e.currency,
      e.exchange_rate,
      splitsText(e),
    ])
  );
}

/**
 * 把支出明細序列化成指定格式。
 */
export function exportExpenses(
  expenses: Expense[],
  format: ExportFormat,
  labels: ExpenseLabels
): ExportFile {
  const meta = FORMAT_META[format];
  let content: string;
  switch (format) {
    case 'markdown':
      content = toMarkdown(expenses, labels);
      break;
    case 'csv':
      content = toExpenseCsv(expenses, labels);
      break;
    case 'json':
      content = JSON.stringify(expenses, null, 2);
      break;
  }
  return { content, ...meta };
}
