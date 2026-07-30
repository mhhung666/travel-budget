import type { StatsExpenseSort } from '@/types';

export interface StatsExpenseCursor {
  sort: StatsExpenseSort;
  value: string | number;
  id: string;
}

export function encodeStatsExpenseCursor(cursor: StatsExpenseCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeStatsExpenseCursor(
  encoded: string,
  expectedSort: StatsExpenseSort
): StatsExpenseCursor | null {
  try {
    if (encoded.length > 512) return null;
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
    if (!value || typeof value !== 'object') return null;

    const cursor = value as Partial<StatsExpenseCursor>;
    if (
      cursor.sort !== expectedSort ||
      (typeof cursor.value !== 'string' && typeof cursor.value !== 'number') ||
      typeof cursor.id !== 'string' ||
      !/^[a-f\d]{24}$/i.test(cursor.id)
    ) {
      return null;
    }

    const expectsAmount = expectedSort === 'amountAsc' || expectedSort === 'amountDesc';
    if (expectsAmount ? typeof cursor.value !== 'number' : typeof cursor.value !== 'string') {
      return null;
    }
    if (
      (expectsAmount && !Number.isFinite(cursor.value)) ||
      (!expectsAmount && Number.isNaN(Date.parse(cursor.value as string)))
    ) {
      return null;
    }

    return cursor as StatsExpenseCursor;
  } catch {
    return null;
  }
}
