'use client';

import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency, getCurrencySymbol } from '@/constants/currencies';
import { getCategoryIcon } from '@/constants/categories';
import type { Expense } from '@/types';

export interface ExpenseCardProps {
  expense: Expense;
  currentUserId?: string;
  onEdit?: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
  showActions?: boolean;
}

export function ExpenseCard({
  expense,
  currentUserId,
  onEdit,
  onDelete,
  showActions = true,
}: ExpenseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isOwner = currentUserId === expense.payer_id;
  const canModify = showActions && isOwner;

  const displayAmount =
    expense.currency === 'TWD'
      ? formatCurrency(expense.amount, 'TWD')
      : `${getCurrencySymbol(expense.currency)}${expense.original_amount.toLocaleString()} (${formatCurrency(expense.amount, 'TWD')})`;

  return (
    <Card className="mb-2">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardContent className="p-4 pb-2 last:pb-2">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Avatar className="w-6 h-6 text-[10px]">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {expense.payer_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-xs text-muted-foreground">
                  {expense.payer_name}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(expense.date).toLocaleDateString()}
                </div>
                <Badge
                  variant="outline"
                  className="px-1 py-0 text-[10px] min-w-[32px] justify-center h-5 font-normal"
                >
                  {getCategoryIcon(expense.category || 'other')}
                </Badge>
              </div>
              <div className="font-medium text-sm">
                {expense.description}
              </div>
              <div className="text-base font-semibold text-primary">
                {displayAmount}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {canModify && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onEdit?.(expense)}
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete?.(expense)}
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </Button>
                </>
              )}
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>

          <CollapsibleContent>
            <div className="mt-2 pt-2 border-t border-border">
              <div className="text-xs text-muted-foreground mb-2 block">
                Split with ({expense.splits.length} people):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {expense.splits.map((split) => (
                  <Badge
                    key={split.user_id}
                    variant="outline"
                    className="text-xs font-normal"
                  >
                    {split.display_name || split.username}: {formatCurrency(split.share_amount, 'TWD')}
                  </Badge>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
