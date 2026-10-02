import type { Balance, Transaction } from '@/types';
import type { ExportFile, ExportFormat } from './types';
import { FORMAT_META } from './types';
import { toCsv } from './csv';

export interface SettlementExportData {
  balances: Balance[];
  transactions: Transaction[];
  totalExpenses: number;
}

export interface SettlementLabels {
  /** 文件主標題，例如「結算」 */
  heading: string;
  /** 總支出文字，例如「總支出」 */
  totalExpenses: string;
  /** 每人結餘區塊標題 */
  balancesHeading: string;
  /** 轉帳建議區塊標題 */
  transfersHeading: string;
  /** 無轉帳時的文字，例如「已結清，無需轉帳」 */
  noTransfers: string;
  columns: { member: string; paid: string; owed: string; balance: string };
}

function toMarkdown(data: SettlementExportData, labels: SettlementLabels): string {
  const { columns: c } = labels;
  const head = [c.member, c.paid, c.owed, c.balance];

  const lines = [
    `# ${labels.heading}`,
    '',
    `**${labels.totalExpenses}: ${data.totalExpenses}**`,
    '',
    `## ${labels.balancesHeading}`,
    '',
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...data.balances.map(
      (b) => `| ${b.username} | ${b.totalPaid} | ${b.totalOwed} | ${b.balance} |`
    ),
    '',
    `## ${labels.transfersHeading}`,
    '',
  ];

  if (data.transactions.length === 0) {
    lines.push(labels.noTransfers, '');
  } else {
    lines.push(...data.transactions.map((t) => `- ${t.from} → ${t.to}: ${t.amount}`), '');
  }

  return lines.join('\n');
}

function toSettlementCsv(data: SettlementExportData, labels: SettlementLabels): string {
  const { columns: c } = labels;
  return toCsv(
    [c.member, c.paid, c.owed, c.balance],
    data.balances.map((b) => [b.username, b.totalPaid, b.totalOwed, b.balance])
  );
}

/**
 * 把結算資料序列化成指定格式。
 */
export function exportSettlement(
  data: SettlementExportData,
  format: ExportFormat,
  labels: SettlementLabels
): ExportFile {
  const meta = FORMAT_META[format];
  let content: string;
  switch (format) {
    case 'markdown':
      content = toMarkdown(data, labels);
      break;
    case 'csv':
      content = toSettlementCsv(data, labels);
      break;
    case 'json':
      content = JSON.stringify(data, null, 2);
      break;
  }
  return { content, ...meta };
}
