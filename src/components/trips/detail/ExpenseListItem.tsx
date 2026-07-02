'use client';

import { useState } from 'react';
import { CalendarDays, ChevronDown, CloudOff, Edit2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getCategoryIcon } from '@/constants/categories';
import { formatCurrency } from '@/constants/currencies';
import type { Expense } from '@/types';
import { isOptimisticId } from '@/lib/optimisticExpense';
import { ReceiptThumb } from '@/components/trips/detail/ReceiptAttachments';
import { ExpenseComments, ExpenseCommentsToggle } from '@/components/expenses';
import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ExpenseListItemProps {
  expense: Expense;
  tripId: string;
  /** 此筆支出關聯的行程日序（已過濾、排序），供「Day N」標籤。 */
  dayNumbers: number[];
  commentCount: number;
  isCurrentUserMember: boolean;
  currentUserId?: string;
  isCurrentUserAdmin: boolean;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

/**
 * 統一的支出列表項（取代舊 TripExpenses 內嵌大卡片）：
 * 收合時是單行摘要（分類 icon＋描述＋付款人／金額），整列可點（≥44px 觸控目標）；
 * 展開才載入分帳、標籤、收據與留言，行動端列表因此可一眼掃過「今天花了什麼」。
 */
export default function ExpenseListItem({
  expense,
  tripId,
  dayNumbers,
  commentCount,
  isCurrentUserMember,
  currentUserId,
  isCurrentUserAdmin,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: ExpenseListItemProps) {
  const tExpense = useTranslations('expense');
  const tOffline = useTranslations('offline');
  const tItinerary = useTranslations('itinerary');

  const [commentsOpen, setCommentsOpen] = useState(false);

  const pending = isOptimisticId(expense.id);

  return (
    <div className="rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-h-[3.5rem] w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-base"
        >
          {getCategoryIcon(expense.category)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{expense.description}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">
              {expense.payer_name} {tExpense('paidBy')}
            </span>
            {pending && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-300 px-1.5 font-normal text-amber-600"
              >
                <CloudOff className="h-3 w-3" />
                {tOffline('pending')}
              </Badge>
            )}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block font-semibold tabular-nums text-primary">
            {formatCurrency(expense.amount, 'TWD')}
          </span>
          {expense.currency !== 'TWD' && (
            <span className="block text-xs tabular-nums text-muted-foreground">
              {Number(expense.original_amount).toLocaleString()} {expense.currency}
            </span>
          )}
        </span>

        <ChevronDown
          aria-hidden
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t px-3 pb-3 pt-3">
          {/* 日期／匯率／Day／標籤 */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{new Date(expense.date).toLocaleDateString()}</span>
            {expense.currency !== 'TWD' && (
              <span>
                · {tExpense('rate')} {expense.exchange_rate}
              </span>
            )}
            {dayNumbers.map((dayNumber) => (
              <Badge
                key={dayNumber}
                variant="secondary"
                className="gap-1 font-normal text-muted-foreground"
              >
                <CalendarDays className="h-3 w-3" />
                {tItinerary('dayLabel', { dayNumber })}
              </Badge>
            ))}
            {expense.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="font-normal">
                {tag}
              </Badge>
            ))}
          </div>

          {/* 分帳 */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {tExpense('splitMembers')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {expense.splits.map((split) => (
                <Badge key={split.user_id} variant="outline" className="font-normal">
                  {split.display_name}: {formatCurrency(Math.round(split.share_amount), 'TWD')}
                </Badge>
              ))}
            </div>
          </div>

          {/* 收據 */}
          {expense.attachments && expense.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {expense.attachments.map((a) => (
                <ReceiptThumb key={a.key} tripId={tripId} attachment={a} />
              ))}
            </div>
          )}

          {/* 留言＋操作（optimistic 尚無 server id，等建立完成才可操作） */}
          {!pending && (
            <div className="flex items-center justify-between gap-2">
              <ExpenseCommentsToggle
                count={commentCount}
                open={commentsOpen}
                onToggle={() => setCommentsOpen((v) => !v)}
              />
              {isCurrentUserMember && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 gap-1.5 md:h-9"
                    onClick={() => onEdit(expense)}
                  >
                    <Edit2 className="h-4 w-4" />
                    {tExpense('edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive md:h-9"
                    onClick={() => onDelete(expense.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {tExpense('delete')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {!pending && commentsOpen && (
            <ExpenseComments
              tripId={tripId}
              expenseId={expense.id}
              currentUserId={currentUserId}
              isAdmin={isCurrentUserAdmin}
            />
          )}
        </div>
      )}
    </div>
  );
}
