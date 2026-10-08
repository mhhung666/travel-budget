import type { QueuedExpense } from '@/storage/expenseQueue';

export function queueRetryDeadline(record: QueuedExpense, accountUntil: number) {
  return record.status === 'resolved'
    ? 0
    : Math.max(record.nextAt, record.rateLimitUntil, accountUntil);
}
