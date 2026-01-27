'use client';

import { Box, Typography, Button, Alert } from '@mui/material';
import { Add } from '@mui/icons-material';
import { ExpenseCard } from './ExpenseCard';
import type { Expense } from '@/types';

export interface ExpenseListProps {
  expenses: Expense[];
  currentUserId?: number;
  onEdit?: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
  onAdd?: () => void;
  emptyMessage?: string;
  emptyActionLabel?: string;
  showAddButton?: boolean;
}

/**
 * Expense list component
 *
 * @example
 * <ExpenseList
 *   expenses={expenses}
 *   currentUserId={user.id}
 *   onEdit={handleEdit}
 *   onDelete={handleDelete}
 *   onAdd={() => setShowAddDialog(true)}
 *   emptyMessage="No expenses yet"
 *   emptyActionLabel="Add your first expense"
 * />
 */
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
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          {emptyMessage}
        </Alert>
        {showAddButton && onAdd && (
          <Button variant="contained" startIcon={<Add />} onClick={onAdd}>
            {emptyActionLabel}
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box>
      {expenses.map((expense) => (
        <ExpenseCard
          key={expense.id}
          expense={expense}
          currentUserId={currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </Box>
  );
}
