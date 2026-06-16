'use client';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus } from 'lucide-react';
import { ExpenseCard } from './ExpenseCard';
import type { Expense } from '@/types';

export interface ExpenseListProps {
  expenses: Expense[];
  currentUserId?: string;
  onEdit?: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
  onAdd?: () => void;
  emptyMessage?: string;
  emptyActionLabel?: string;
  showAddButton?: boolean;
}

export function ExpenseList({
  expenses,
  currentUserId,
  onEdit,
  onDelete,
  onAdd,
  emptyMessage = 'No expenses yet',
  emptyActionLabel = 'Add expense',
  showAddButton = true,
}: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <div className="text-center py-8">
        <Alert variant="default" className="mb-4 w-fit mx-auto border-blue-200 bg-blue-50 text-blue-900 dark:bg-blue-900/10 dark:text-blue-200 dark:border-blue-900">
          <AlertDescription>{emptyMessage}</AlertDescription>
        </Alert>
        {showAddButton && onAdd && (
          <Button onClick={onAdd}>
            <Plus size={20} className="mr-2" />
            {emptyActionLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {expenses.map((expense) => (
        <ExpenseCard
          key={expense.id}
          expense={expense}
          currentUserId={currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
