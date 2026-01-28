'use client';

import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  IconButton,
  Avatar,

  Collapse,
} from '@mui/material';
import { Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency, getCurrencySymbol } from '@/constants/currencies';
import { getCategoryIcon } from '@/constants/categories';
import type { Expense } from '@/types';

export interface ExpenseCardProps {
  expense: Expense;
  currentUserId?: number;
  onEdit?: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
  showActions?: boolean;
}

/**
 * Expense card component displaying expense details
 *
 * @example
 * <ExpenseCard
 *   expense={expense}
 *   currentUserId={user.id}
 *   onEdit={(e) => openEditDialog(e)}
 *   onDelete={(e) => handleDelete(e.id)}
 * />
 */
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
    <Card variant="outlined" sx={{ mb: 1 }}>
      <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Avatar sx={{ width: 24, height: 24, fontSize: 12, bgcolor: 'primary.main' }}>
                {expense.payer_name.charAt(0).toUpperCase()}
              </Avatar>
              <Typography variant="body2" color="text.secondary">
                {expense.payer_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(expense.date).toLocaleDateString()}
              </Typography>
              <Chip
                label={getCategoryIcon(expense.category || 'other')}
                size="small"
                variant="outlined"
                sx={{ minWidth: 32, fontSize: '14px' }}
              />
            </Box>
            <Typography variant="body1" fontWeight={500}>
              {expense.description}
            </Typography>
            <Typography variant="h6" fontWeight={600} color="primary.main">
              {displayAmount}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {canModify && (
              <>
                <IconButton size="small" onClick={() => onEdit?.(expense)} title="Edit">
                  <Edit2 size={16} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => onDelete?.(expense)}
                  color="error"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </IconButton>
              </>
            )}
            <IconButton size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </IconButton>
          </Box>
        </Box>

        <Collapse in={expanded}>
          <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              Split with ({expense.splits.length} people):
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {expense.splits.map((split) => (
                <Chip
                  key={split.user_id}
                  label={`${split.display_name || split.username}: ${formatCurrency(split.share_amount, 'TWD')}`}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}
