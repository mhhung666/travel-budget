'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import { CURRENCIES, formatCurrency } from '@/constants/currencies';
import type { Member } from '@/services/member.service';
import type { Expense, CreateExpenseRequest, UpdateExpenseRequest } from '@/services/expense.service';

export interface ExpenseFormData {
  payer_id: number;
  original_amount: string;
  currency: string;
  exchange_rate: string;
  description: string;
  date: string;
  split_with: number[];
}

export interface ExpenseFormProps {
  open: boolean;
  mode: 'create' | 'edit';
  members: Member[];
  currentUserId?: number;
  initialData?: Partial<ExpenseFormData>;
  editingExpense?: Expense | null;
  loading?: boolean;
  error?: string | null;
  onSubmit: (data: CreateExpenseRequest | UpdateExpenseRequest) => Promise<void>;
  onClose: () => void;
}

const defaultFormData: ExpenseFormData = {
  payer_id: 0,
  original_amount: '',
  currency: 'TWD',
  exchange_rate: '1.0',
  description: '',
  date: new Date().toISOString().split('T')[0],
  split_with: [],
};

/**
 * Expense form dialog for creating or editing expenses
 *
 * @example
 * // Create mode
 * <ExpenseForm
 *   open={showDialog}
 *   mode="create"
 *   members={members}
 *   currentUserId={user.id}
 *   onSubmit={handleCreate}
 *   onClose={() => setShowDialog(false)}
 * />
 *
 * // Edit mode
 * <ExpenseForm
 *   open={showEditDialog}
 *   mode="edit"
 *   members={members}
 *   editingExpense={selectedExpense}
 *   onSubmit={handleUpdate}
 *   onClose={() => setShowEditDialog(false)}
 * />
 */
export function ExpenseForm({
  open,
  mode,
  members,
  currentUserId,
  initialData,
  editingExpense,
  loading = false,
  error,
  onSubmit,
  onClose,
}: ExpenseFormProps) {
  const [form, setForm] = useState<ExpenseFormData>(() => ({
    ...defaultFormData,
    payer_id: currentUserId || 0,
    ...initialData,
  }));

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && editingExpense) {
        setForm({
          payer_id: editingExpense.payer_id,
          original_amount: editingExpense.original_amount.toString(),
          currency: editingExpense.currency,
          exchange_rate: editingExpense.exchange_rate.toString(),
          description: editingExpense.description,
          date: editingExpense.date,
          split_with: editingExpense.splits.map((s) => s.user_id),
        });
      } else {
        setForm({
          ...defaultFormData,
          payer_id: currentUserId || 0,
          ...initialData,
        });
      }
    }
  }, [open, mode, editingExpense, currentUserId, initialData]);

  const handleChange = (field: keyof ExpenseFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { target: { value: unknown } }
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const toggleSplitMember = (userId: number) => {
    setForm((prev) => ({
      ...prev,
      split_with: prev.split_with.includes(userId)
        ? prev.split_with.filter((id) => id !== userId)
        : [...prev.split_with, userId],
    }));
  };

  const selectAllMembers = () => {
    setForm((prev) => ({
      ...prev,
      split_with: members.map((m) => m.id),
    }));
  };

  const calculateConvertedAmount = () => {
    const amount = parseFloat(form.original_amount) || 0;
    const rate = parseFloat(form.exchange_rate) || 1;
    return amount * rate;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'create') {
      const data: CreateExpenseRequest = {
        payer_id: form.payer_id,
        original_amount: parseFloat(form.original_amount),
        currency: form.currency,
        exchange_rate: parseFloat(form.exchange_rate),
        description: form.description.trim(),
        date: form.date,
        split_with: form.split_with,
      };
      await onSubmit(data);
    } else {
      const data: UpdateExpenseRequest = {
        original_amount: parseFloat(form.original_amount),
        currency: form.currency,
        exchange_rate: parseFloat(form.exchange_rate),
        description: form.description.trim(),
      };
      await onSubmit(data);
    }
  };

  const isValid =
    form.description.trim() &&
    parseFloat(form.original_amount) > 0 &&
    (mode === 'edit' || (form.payer_id > 0 && form.split_with.length > 0));

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{mode === 'create' ? 'Add Expense' : 'Edit Expense'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {mode === 'create' && (
              <FormControl fullWidth>
                <InputLabel>Payer</InputLabel>
                <Select
                  value={form.payer_id}
                  onChange={handleChange('payer_id') as any}
                  label="Payer"
                  disabled={loading}
                >
                  {members.map((member) => (
                    <MenuItem key={member.id} value={member.id}>
                      {member.display_name || member.username}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              label="Description"
              value={form.description}
              onChange={handleChange('description')}
              required
              disabled={loading}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Amount"
                type="number"
                value={form.original_amount}
                onChange={handleChange('original_amount')}
                required
                disabled={loading}
                inputProps={{ step: '0.01', min: '0' }}
                sx={{ flex: 1 }}
              />
              <FormControl sx={{ minWidth: 100 }}>
                <InputLabel>Currency</InputLabel>
                <Select
                  value={form.currency}
                  onChange={handleChange('currency') as any}
                  label="Currency"
                  disabled={loading}
                >
                  {CURRENCIES.map((c) => (
                    <MenuItem key={c.code} value={c.code}>
                      {c.symbol} {c.code}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {form.currency !== 'TWD' && (
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  label="Exchange Rate (to TWD)"
                  type="number"
                  value={form.exchange_rate}
                  onChange={handleChange('exchange_rate')}
                  disabled={loading}
                  inputProps={{ step: '0.0001', min: '0' }}
                  sx={{ flex: 1 }}
                />
                <Typography variant="body2" color="text.secondary">
                  = {formatCurrency(calculateConvertedAmount(), 'TWD')}
                </Typography>
              </Box>
            )}

            {mode === 'create' && (
              <TextField
                label="Date"
                type="date"
                value={form.date}
                onChange={handleChange('date')}
                required
                disabled={loading}
                InputLabelProps={{ shrink: true }}
              />
            )}

            {mode === 'create' && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">Split with:</Typography>
                  <Button size="small" onClick={selectAllMembers} disabled={loading}>
                    Select All
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {members.map((member) => (
                    <FormControlLabel
                      key={member.id}
                      control={
                        <Checkbox
                          checked={form.split_with.includes(member.id)}
                          onChange={() => toggleSplitMember(member.id)}
                          disabled={loading}
                        />
                      }
                      label={member.display_name || member.username}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !isValid}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {mode === 'create' ? 'Add' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
